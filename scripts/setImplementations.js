const hre = require('hardhat');
const { getJson, saveJson, jsons } = require('./utils');

async function main() {

    const dragonswapStakerFactoryAddress = getJson(jsons.addresses)[hre.network.name][
    'DragonswapStakerFactory'
    ];

    const dragonswapStakerFactory = await hre.ethers.getContractAt(
        'DragonswapStakerFactory', dragonswapStakerFactoryAddress
    );

    let stakerFarmImplFactory = await hre.ethers.getContractFactory('DragonswapStaker');
    const stakerFarmImplClassic = await stakerFarmImplFactory.deploy();
    await stakerFarmImplClassic.deployed();
    console.log(`DragonswapStaker address: ${stakerFarmImplClassic.address}`);

    saveJson(
        jsons.addresses,
        hre.network.name,
        'DragonswapStakerImplClassic',
        stakerFarmImplClassic.address
    );

    await dragonswapStakerFactory.setImplementationClassic(stakerFarmImplClassic.address);
    console.log('Classic implementation set on factory');

    stakerFarmImplFactory = await hre.ethers.getContractFactory('DragonswapStakerBoosted');
    const stakerFarmImplBoosted = await stakerFarmImplFactory.deploy();
    await stakerFarmImplBoosted.deployed();
    console.log(`DragonswapStakerBoosted address: ${stakerFarmImplBoosted.address}`);

    saveJson(
        jsons.addresses,
        hre.network.name,
        'DragonswapStakerImplBoosted',
        stakerFarmImplBoosted.address
    );

    await dragonswapStakerFactory.setImplementationBoosted(stakerFarmImplBoosted.address);
    console.log('Boosted implementation set on factory');

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
