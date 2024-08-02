![Screenshot](dsw_farm.jpg)

# Dragonswap Farming Contracts ![CI](https://github.com/dragonswap-app/dragonswap-farming/actions/workflows/ci.yml/badge.svg)

## Setup

### Dependencies
- `$ nvm use`
- `$ yarn`

### Environment
 - Fill in the environment values as described with .env.example template inside the .env file (comand below)
---
## Usage
### Compile code
`$ yarn compile`

### Run tests
`$ yarn test`

### Run coverage
`$ yarn coverage`

### Run lint
`$ yarn lint`

### Format code
`$ yarn format`

### Compute bytecode size of each contract
`$ yarn size`

---
## Setup local node
### Setup hardhat node
`$ yarn node`

### Setup node forked from Sei Mainnet
`$ yarn node-mainnet`

### Setup node forked from Sei Testnet
`$ yarn node-testnet`

## CI
### Update abis manually
`$ node scripts/updateAbis.js`

## Testing deployment on Sei Mainnet Fork
### Step 1:
#### Add `OWNER_ADDRESS` to .env file
### Step 2:
#### Add all needed tokens to `deployments/tokenConfig.json` under `local` part of json
### Step 3:
#### Check if `DragonswapStakerFactory` contract address in `deployments/addresses.json` under `local` is matching the one declared in `mainnet` part of json
### Step 4:
#### Forking current state of chain
`$ npx hardhat node --fork https://evm-rpc.sei-apis.com`
#### Forking state from a specific block number
`$ npx hardhat node --fork https://evm-rpc.sei-apis.com --fork-block-number <blocknumber>`
### Step 5:
#### Test deployment for classic farm
`$ npx hardhat run --network local scripts/deployFarmSimulation.js`
#### Test deployment for boosted farm
`$ npx hardhat run --network local scripts/deployBoostedFarmSimulation.js`


---
## License
MIT
