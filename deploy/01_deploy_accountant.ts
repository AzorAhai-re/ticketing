import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy, get} = deployments;

    const {deployer} = await getNamedAccounts();

    const bouncer = await get("Bouncer");
    const adminWallet: string = process.env.ADMIN_WALLET!;
    const initialFundReceiver: string = process.env.INIT_FUND_RECEIVER!;

    await deploy("Accountant", {
        from: deployer,
        args: [adminWallet, initialFundReceiver, bouncer.address],
        skipIfAlreadyDeployed: true,
        log: true,
        deterministicDeployment: true
    });
};
export default func;
func.tags = ["Accountant"]
func.dependencies = ["Bouncer"]