import chai, { expect } from "chai"
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { Ticket, Bouncer, Bouncer__factory } from '../typechain-types';
import { deployBouncerAndTicket} from './helpers/deploy_contracts';

describe("Ticket", function () {
    let ticket: Ticket;
    let bouncer: Bouncer;

    let deployer: SignerWithAddress;
    let receiver: SignerWithAddress;
    let adminWallet: SignerWithAddress;
    let fundReceiver: SignerWithAddress;

    let regFeeStr: string;
    let vipFeeStr: string;
    let maxMint: BigNumber;
    let rateLimit: BigNumber;

    beforeEach(async () => {
        [deployer, receiver, adminWallet, fundReceiver] = await ethers.getSigners();

        regFeeStr = "0.1";
        vipFeeStr = "0.15";
        maxMint = BigNumber.from(10);
        rateLimit = maxMint;

        const [_bouncer, , _ticket] = await deployBouncerAndTicket(deployer, regFeeStr, vipFeeStr, maxMint, rateLimit, adminWallet, fundReceiver);
        ticket = _ticket as Ticket;
        bouncer = _bouncer as Bouncer;
    });

    describe("State: preMint", () => {
        it("should have a valid Fee Structure", async () => {
            const vipMask = BigNumber.from(1).shl(128).sub(1);
            const vipBitPos = 128;

            const mintFee = await ticket.FEE_SCHEDULES();
            const regFeeBN = mintFee.and(vipMask);
            const vipFeeBN = mintFee.shr(vipBitPos);

            expect(regFeeBN._hex).to.be.eq(
                parseEther(regFeeStr)._hex
            );
            expect(vipFeeBN._hex).to.be.eq(
                parseEther(vipFeeStr)._hex
            );
        });

        it("should get the MaxMint amount after deployment", async () => {
            const _maxMint = await ticket.MAX_MINT();

            expect(_maxMint._hex).to.be.eq(maxMint._hex);
        });

        it("should show a 0 `currEvent`", async () => {
            const currEvent = await ticket.currEvent();

            expect(currEvent).to.be.eq(0);
        });

        it("should not allow non-Admins to set an eventID", async () => {
            await expect(ticket.connect(receiver).setNextEventID()).to.be.revertedWith(
                "B03: Only the admin or the governor can perform this action"
            );
        });

        it("should show 0 tickets left", async () => {
            expect(await ticket.ticketsLeft()).to.be.eq(0);
        });

        it("should not be paused", async () => {
            expect(await ticket.paused()).to.be.eq(false);
        });

        it("should not have a minted NFT", async () => {
            await expect(ticket.getVipStatus(0)).to.be.reverted;
            await expect(ticket.getEventID(0)).to.be.reverted;
        });

        it("should fail if no tickets in stock", async () => {
            const [regularFee, _] = await ticket.getMINTFEESCHEDULES();
            await expect(ticket.connect(deployer).mint(1, { value: regularFee })).to.be.reverted
        });

        describe("Setters", () => {
            it("should only set a bouncer if authorised", async () => {
                const badBouncerFact: Bouncer__factory = await ethers.getContractFactory("Bouncer", receiver);
                const badBouncer = await badBouncerFact.deploy(receiver.address);
                await badBouncer.deployed();

                await expect(ticket.connect(receiver).setBouncer(badBouncer.address)).to.be.revertedWith(
                    "B03: Only the admin or the governor can perform this action"
                );

                const goodBouncerFact: Bouncer__factory = await ethers.getContractFactory("Bouncer", deployer);
                const goodBouncer = await goodBouncerFact.deploy(deployer.address);
                await goodBouncer.deployed();

                expect(goodBouncer.address).to.not.be.eq(bouncer.address);
                await ticket.connect(deployer).setBouncer(goodBouncer.address);
                await expect(ticket.connect(deployer).setBouncer(goodBouncer.address)).to.not.be.reverted;
            });

            it("should allow only an admin to set a mint fee schedule", async () => {
                await expect(ticket.connect(receiver).setMINTFEESCHEDULES(0, 1)).to.be.revertedWith(
                    "B03: Only the admin or the governor can perform this action"
                );
                await expect(ticket.connect(deployer).setMINTFEESCHEDULES(0, 1)).to.not.be.reverted;
            });

            it("should only set Max Mint if authorised", async () => {
                await expect(ticket.connect(receiver).setMAXMINT(9)).to.be.revertedWith(
                    "B03: Only the admin or the governor can perform this action"
                );
                await expect(ticket.connect(deployer).setMAXMINT(9)).to.not.be.reverted;
            });

            it("should allow only an admin to set ticket stock", async () => {
                await expect(ticket.connect(receiver).setTicketsLeft(10)).to.be.revertedWith(
                    "B03: Only the admin or the governor can perform this action"
                );
                await expect(ticket.connect(deployer).setTicketsLeft(10)).to.not.be.reverted;
            });
        });
    });
    describe("State: Minting", () => {
        let regFee: BigNumber;
        let vipFee: BigNumber;

        beforeEach(async () => {
            // set stock to 20
            await ticket.connect(deployer).setTicketsLeft(20);

            // get fee schedules
            [regFee, vipFee] = await ticket.getMINTFEESCHEDULES();
        });

        it("should mint 1 regular and vip ticket each", async () => {
            await ticket.connect(receiver).mint(1, { value: regFee });
            network.provider.send("evm_increaseTime", [3600])
            await ticket.connect(receiver).mint(1, { value: vipFee });

            expect(await ticket.balanceOf(receiver.address)).to.be.eq(2);
        });

        it("should identify vip tickets from regular", async () => {
            await ticket.connect(receiver).mint(1, { value: vipFee });
            network.provider.send("evm_increaseTime", [3600])
            await ticket.connect(receiver).mint(1, { value: regFee });

            expect(await ticket.ownerOf(0)).to.be.eq(receiver.address);
            expect(await ticket.getVipStatus(0)).to.be.eq(true);

            expect(await ticket.ownerOf(1)).to.be.eq(receiver.address);
            expect(await ticket.getVipStatus(1)).to.be.eq(false);
        });

        it("should show accurate event ID", async () => {
            await ticket.connect(receiver).mint(1, { value: regFee });
            expect(await ticket.getEventID(0)).to.be.eq(0);

            // second event starts
            await ticket.connect(deployer).setNextEventID();

            network.provider.send("evm_increaseTime", [3600])
            await ticket.connect(receiver).mint(1, { value: regFee });
            expect(await ticket.getEventID(1)).to.be.eq(1);

            // third event starts
            await ticket.connect(deployer).setNextEventID();

            network.provider.send("evm_increaseTime", [3600])
            await ticket.connect(receiver).mint(2, { value: regFee.mul(2) });
            expect(await ticket.getEventID(2)).to.be.eq(2);
            expect(await ticket.getEventID(3)).to.be.eq(2);
        });

        it("should mint up to the limit", async () => {
            const maxMint = await ticket.MAX_MINT();
            await ticket.connect(receiver).mint(maxMint, { value: maxMint.mul(regFee) });

            expect(await ticket.balanceOf(receiver.address)).to.be.eq(maxMint);
        });

        it("should not be able to mint past the limit", async () => {
            const overMint = (await ticket.MAX_MINT()).add(1);
            await expect(
                ticket.connect(receiver).mint(overMint, { value: overMint.mul(regFee) })
            ).to.be.revertedWith(
                "T02: Too many tickets requested"
            );
        });

        it("should run out of tickets and will not mint any more", async () => {
            await ticket.connect(receiver).mint(maxMint, { value: maxMint.mul(regFee) });
            network.provider.send("evm_increaseTime", [3600]);
            await ticket.connect(receiver).mint(maxMint, { value: maxMint.mul(regFee) });
            network.provider.send("evm_increaseTime", [3600]);

            await expect(
                ticket.connect(receiver).mint(1, { value: regFee })
            ).to.be.reverted;
        });

        it("should revertt if msg.value == ticketsLeft == 0",async () => {
            await ticket.connect(receiver).mint(maxMint, { value: maxMint.mul(regFee) });
            network.provider.send("evm_increaseTime", [3600]);
            await ticket.connect(receiver).mint(maxMint, { value: maxMint.mul(regFee) });
            network.provider.send("evm_increaseTime", [3600]);

            await expect(
                ticket.connect(receiver).mint(1, { value: 0 })
            ).to.be.reverted;
        });
    });
});
