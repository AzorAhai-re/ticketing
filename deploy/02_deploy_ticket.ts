import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { parseEther } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy, get} = deployments;

    const {deployer} = await getNamedAccounts();

    const bouncer = await get("Bouncer");
    const accoutnant = await get("Accountant");

    const regularFeeSchedule = parseEther(process.env.REG_FEE!);
    const VipFeeSchedule = parseEther(process.env.VIP_FEE!);
    const _initMintFee = VipFeeSchedule.shl(128).or(regularFeeSchedule);


    await deploy("Ticket", {
        from: deployer,
        args: [
            accoutnant.address,
            bouncer.address,
            process.env.NFT_NAME,
            process.env.NFT_SYM,
            _initMintFee,
            BigNumber.from(process.env.MAX_MINT!)
        ],
        skipIfAlreadyDeployed: true,
        log: true,
        deterministicDeployment: true
    });
};
export default func;
func.tags = ["Minter"]
func.dependencies = ["Bouncer", "Accountant"]