import { ethers } from "hardhat"
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { Accountant, Accountant__factory, Ticket, Ticket__factory, Bouncer, Bouncer__factory } from '../../typechain-types';

export const deployTicket = async (deployer: SignerWithAddress, bouncer: Bouncer, accountant: Accountant, regFeeStr: string, vipFeeStr: string, maxMint: BigNumber, rateLimit: BigNumber) => {
    deployer = deployer ? deployer : (await ethers.getSigners())[0];

    const regularFeeSchedule = parseEther(regFeeStr);
    const VipFeeSchedule = parseEther(vipFeeStr);
    const _initMintFee = VipFeeSchedule.shl(128).or(regularFeeSchedule);

    const ticketFactory = await ethers.getContractFactory("Ticket", deployer) as Ticket__factory;

    const ticket = await ticketFactory.deploy(accountant.address, bouncer.address, "TicketMaestro", "TM", _initMintFee, maxMint);
    return (await ticket.deployed());
}

export const deployAccountant = async (deployer: SignerWithAddress, adminWallet: SignerWithAddress, fundReceiver: SignerWithAddress, bonucer: Bouncer) => {
    deployer = deployer ? deployer : (await ethers.getSigners())[0];

    const accountantFactory = await ethers.getContractFactory("Accountant", deployer) as Accountant__factory;

    const accountant = await accountantFactory.deploy(adminWallet.address, fundReceiver.address, bonucer.address);

    return accountant
};

export const deployBouncer = async (deployer: SignerWithAddress) => {
    deployer = deployer ? deployer : (await ethers.getSigners())[0];

    const bouncerFactory = await ethers.getContractFactory("Bouncer", deployer) as Bouncer__factory;
    const bonucer = await bouncerFactory.deploy(deployer.address);

    return (await bonucer.deployed());
};

export const deployBouncerAndTicket = async (deployer: SignerWithAddress, regFeeStr: string, vipFeeStr: string, maxMint: BigNumber, rateLimit: BigNumber, adminWallet: SignerWithAddress, fundReceiver: SignerWithAddress) => {
    const bouncer: Bouncer = await deployBouncer(deployer);
    const accountant: Accountant = await deployAccountant(deployer, adminWallet, fundReceiver, bouncer);
    const ticket: Ticket = await deployTicket(deployer, bouncer, accountant, regFeeStr, vipFeeStr, maxMint, rateLimit);

    return [bouncer, accountant, ticket]
};
