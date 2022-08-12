import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-deploy';

import { HardhatUserConfig } from "hardhat/config";

import { node_url, accounts } from './utils/network';


const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000
          }
        }
      }
    ]
  },
  networks: {
    localhost: {
      url: node_url('localhost'),
      accounts: accounts(),
    },
    mainnet: {
      url: node_url('mainnet'),
      accounts: accounts('mainnet'),
    },
  },
  verify : {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY
    }
  },
};

export default config;
