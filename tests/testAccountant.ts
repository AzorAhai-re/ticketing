import chai, { expect } from "chai"
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Accountant, Bouncer, Ticket } from "../typechain-types";

import { deployBouncerAndTicket } from "./helpers/deploy_contracts"

describe("Accounting", function () {
    let ticket: Ticket;
    let accountant: Accountant;

    let deployer: SignerWithAddress;
    let adminWallet: SignerWithAddress;
    let fundReceiver: SignerWithAddress;
    let shareholders: string[];

    let regFeeStr: string;
    let vipFeeStr: string;
    let maxMint: BigNumber;
    let rateLimit: BigNumber;
    let mintFee: BigNumber;
    let shares: BigNumber[];

    let totalReceived = async () => {
        return (
            await ethers.provider.getBalance(accountant.address)
        ).add(
            await accountant["totalReleased()"]()
        );
    }

    let pendingPayments = async (account: string) => {
        let _totalReceived: BigNumber = await totalReceived();

        return _totalReceived.mul(
            await accountant.shares(account)
        ).div(
            (
                await accountant.totalShares()
            ).add(
                await accountant["released(address)"](account)
            )
        )
    }

    beforeEach(async () => {
        [
            deployer, , adminWallet, fundReceiver
        ] = await ethers.getSigners();

        shareholders = [adminWallet.address, "0x000000000000000000000000000000000000FEeD"];
        shares = [BigNumber.from(75), BigNumber.from(25)];

        regFeeStr = "0.1";
        vipFeeStr = "0.15";
        maxMint = BigNumber.from(10);
        rateLimit = maxMint;

        const [, _accountant, _ticket] = await deployBouncerAndTicket(deployer, regFeeStr, vipFeeStr, maxMint, rateLimit, adminWallet, fundReceiver);


        ticket = _ticket as Ticket;
        accountant = _accountant as Accountant;

        // set stock to 20
        await ticket.connect(deployer).setTicketsLeft(20);

        // get fee schedules
        [mintFee,] = await ticket.getMINTFEESCHEDULES();
    });


    describe("PaymentSplitter: pre pull payment", () => {
        it("should show the correct index of each payee in `_payees`", async () => {
            for (let i = 0; i < shareholders.length; i++) {
                const shareholder = shareholders[i];

                expect(await accountant.payee(i)).to.be.eq(shareholder);
            }
        });

        describe("Shares", () => {
            it("should have the correct total shares", async () => {
                expect(
                    await accountant.totalShares()
                ).to.be.eq(100);
            });

            it("should have the correct allotment of shares", async () => {
                for (let i = 0; i < shareholders.length; i++) {
                    const shareholder = shareholders[i];
                    const share = shares[i]

                    expect(await accountant.shares(shareholder)).to.be.eq(share);
                }
            });
        });


        describe("Releaseables", () => {
            it("should not have released any payments", async () => {
                expect(
                    await accountant["totalReleased()"]()
                ).to.be.eq(0)
            });

            it("should show 0 released for each shareholder", async () => {
                shareholders.forEach(async (shareholder) => {
                    expect(
                        await accountant["released(address)"](shareholder)
                    ).to.be.eq(0);
                });
            });

            it("should not have any Ether releasable to each payee", async () => {
                shareholders.forEach(async (shareholder) => {
                    expect(
                        await accountant["releasable(address)"](shareholder)
                    ).to.be.eq(0);
                });
            });

            it("should revert on `release` due to having a 0 balance", async () => {
                await expect(
                    accountant["release(address)"](adminWallet.address)
                ).to.be.revertedWith("PaymentSplitter: account is not due payment");
            });

            it("should revert on `releaseToBeneficiary` due to having 0 balance", async () => {
                await expect(
                    accountant["releaseToBeneficiary()"]()
                ).to.be.revertedWith("Accountant: account is not due payment");
            });

            it("should revert on `release` if account to release is not the adminWallet", async () => {
                await expect(
                    accountant["release(address)"](fundReceiver.address)
                ).to.be.revertedWith("Accountant: only the admin wallet can receive these funds");
            });
        });
    });
    describe("Accountant: pulling payments", () => {
        let shareholderSigners: SignerWithAddress[];
        beforeEach(async () => {
            const [, , s1, s2] = await ethers.getSigners();
            shareholderSigners = [s1, s2];

            await ticket.connect(adminWallet).mint(
                maxMint, { value: maxMint.mul(mintFee) }
            );
        });

        it("should have correct proportions of releasable funds", async () => {
            for (let i = 0; i < shareholders.length; i++) {
                const shareholder = shareholders[i];
                expect(
                    await accountant["releasable(address)"](shareholder)
                ).to.be.eq(
                    await pendingPayments(shareholder)
                );
            }
        });

        it("should `release` the correct proprotion of funds", async () => {
            const balanceBefore = await ethers.provider.getBalance(adminWallet.address);
            const expBalanceAfter = await pendingPayments(adminWallet.address);

            await expect(
                accountant.connect(deployer)["release(address)"](adminWallet.address)
            ).to.not.be.reverted;

            expect(
                (await ethers.provider.getBalance(adminWallet.address)).sub(balanceBefore)
            ).to.be.closeTo(
                expBalanceAfter, parseEther("0.0001")
            );
        });

        it("should `releaseToBeneficiary` the correct proportion of funds",async () => {
            const balanceBefore = await ethers.provider.getBalance(fundReceiver.address);
            const expBalanceAfter = await pendingPayments("0x000000000000000000000000000000000000FEeD");

            await expect(
                accountant.connect(deployer)["releaseToBeneficiary()"]()
            ).to.not.be.reverted;
            
            expect(
                (await ethers.provider.getBalance(fundReceiver.address)).sub(balanceBefore)
            ).to.be.closeTo(
                expBalanceAfter, parseEther("0.0001")
            );
        });
    });

    describe("Accountant: account management", () => {
        let newFunderReceiver: SignerWithAddress;
        let newFunderReceiverAddress: string;
        let treasuryBalance: BigNumber;

        beforeEach(async () => {
            [, , , , , newFunderReceiver] = await ethers.getSigners();

            treasuryBalance = maxMint.mul(mintFee);

            await ticket.connect(adminWallet).mint(
                maxMint, { value: maxMint.mul(mintFee) }
            );

            newFunderReceiverAddress = newFunderReceiver.address;
            await accountant.setFundReceiver(newFunderReceiver.address);
        });
        describe("newFundReceiver", () => {
            it("should have the same allocation of shares as previous fund receiver", async () => {
                expect(await accountant.shares("0x000000000000000000000000000000000000FEeD")).to.be.eq(
                    25
                );
            });

            it("should have the same proportion of releasable funds", async () => {
                expect(
                    await accountant["releasable(address)"](newFunderReceiver.address)
                ).to.be.eq(
                    await pendingPayments(newFunderReceiver.address)
                );
            });

            it("should receive the correct proportion of funds once released", async () => {
                const balanceBefore = await ethers.provider.getBalance(newFunderReceiver.address);
                const expBalanceAfter = await pendingPayments("0x000000000000000000000000000000000000FEeD");

                await accountant.connect(deployer)["releaseToBeneficiary()"]();

                expect(
                    (await ethers.provider.getBalance(newFunderReceiver.address)).sub(balanceBefore)
                ).to.be.closeTo(
                    expBalanceAfter, parseEther("0.0001")
                );
            });
        });
    });
});
