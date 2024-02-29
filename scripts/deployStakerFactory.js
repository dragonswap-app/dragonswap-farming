const hre = require('hardhat');
const { getJson, saveJson, jsons } = require('./utils');
const { ethers } = require('hardhat');

async function main() {
    await hre.run('compile');

    const myWallet = await hre.ethers.getSigner();
    const myWalletAddress = await myWallet.getAddress();

    const dragonswapStakerFactory = await hre.ethers.getContractFactory(
        'DragonswapStakerFactory'
    );
    const stakerFactory = await dragonswapStakerFactory.deploy(myWalletAddress);
    await stakerFactory.deployed();
    console.log(`DragonswapStakerFactory address: ${stakerFactory.address}`);

    saveJson(
        jsons.addresses,
        hre.network.name,
        'DragonswapStakerFactory',
        stakerFactory.address
    );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
