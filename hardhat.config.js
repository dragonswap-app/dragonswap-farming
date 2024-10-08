require('dotenv').config();
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-waffle');
require('solidity-coverage');
require('hardhat-gas-reporter');
require('hardhat-contract-sizer');

const accounts = process.env.PK ? [process.env.PK] : [];
const timeout = 50000;

module.exports = {
  networks: {
    mainnet: {
      url: 'https://evm-rpc.sei-apis.com',
      chainId: 1329,
      timeout,
      accounts,
    },
    testnet: {
      url: 'https://evm-rpc.arctic-1.seinetwork.io',
      chainId: 713715,
      timeout,
      accounts,
    },
    local: {
      url: 'http://localhost:8545',
    },
    hardhat: {
      evmVersion: 'paris',
    },
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: true,
  },
  gasReporter: {
    enabled: true,
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  solidity: {
    compilers: [
      {
        version: '0.8.25',
        settings: {
          evmVersion: 'paris',
          optimizer: {
            enabled: true,
            runs: 99999,
          },
        },
      },
      {
        version: '0.5.16',
        settings: {
          evmVersion: 'istanbul',
          optimizer: {
            enabled: true,
            runs: 99999,
          },
        },
      },
    ],
  },
};
