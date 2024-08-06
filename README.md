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

## Testing Deployment on Sei Mainnet Fork

**Here we are going to fork SEI Mainnet to a local environment in order to check if deployment of a farm(classic/boosted) would pass as expected when deploying to mainnet**

### Step 1:
**Add `OWNER_ADDRESS` to `.env` file**

### Step 2:
**In `deployments/tokenConfig.json` file create a `local` environment and then copy required tokens addresses from  `mainnet` section and paste them to `local` section**

### Step 3:
**In `deployments/addresses.json` file create a `local` environment and then copy `DragonswapStakerFactory` contract address from `mainnet` section and then paste it in local section**

### Step 4:
**Depending on your needs you can fork a mainnet using the current state of the chain or using a state of the chain from a specific blocknumber:**

**Forking the current state of the chain:**
```sh
$ npx hardhat node --fork https://evm-rpc.sei-apis.com
```

**Forking state from a specific block number:** 
```sh
`$ npx hardhat node --fork https://evm-rpc.sei-apis.com --fork-block-number <blocknumber>`
```
### Step 5:
**Test deployment for classic farm:** 
```sh
`$ npx hardhat run --network local scripts/deployFarmSimulation.js`
```
**Test deployment for boosted farm:**
```sh
`$ npx hardhat run --network local scripts/deployBoostedFarmSimulation.js`
```

### Step 6:

**Check if endTimestamp is greater than startTimestamp. Also check if the duration of the farm is calculated precisely by converting endTimestamp to more readable form which can be done at [https://www.epochconverter.com/]**

---
## License
MIT
