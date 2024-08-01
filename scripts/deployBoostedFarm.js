const hre = require('hardhat');
const { getJson, saveJson, sleep, jsons } = require('./utils');
const { ethers } = require('hardhat');
const {currentTimestamp} = require("../test/helpers");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const wait = async () => {await sleep(3000)};

async function getFarmConfig() {
    const stakeTokenName = getJson(jsons.farmConfig)['boostedFarmSettings']['stakeTokenName'];
    const rewardTokenName = getJson(jsons.farmConfig)['boostedFarmSettings']['rewardTokenName'];
    const boosterTokenName = getJson(jsons.farmConfig)['boostedFarmSettings']['boosterTokenName'];

    const stakeTokenAddress = getJson(jsons.tokenConfig)[hre.network.name][stakeTokenName];
    const rewardTokenAddress = getJson(jsons.tokenConfig)[hre.network.name][rewardTokenName];
    const boosterTokenAddress = getJson(jsons.tokenConfig)[hre.network.name][boosterTokenName];
    const rewardTokenAmount = getJson(jsons.farmConfig)['boostedFarmSettings']['rewardTokenAmount'];
    const boosterTokenAmount = getJson(jsons.farmConfig)['boostedFarmSettings']['boosterTokenAmount'];
    const rewardPerSecond = getJson(jsons.farmConfig)['boostedFarmSettings']['rewardPerSecond'];
    const startTimestamp = getJson(jsons.farmConfig)['boostedFarmSettings']['startTimestamp'];

    return {
        stakeTokenName,
        rewardTokenName,
        boosterTokenName,
        stakeTokenAddress,
        rewardTokenAddress,
        boosterTokenAddress,
        rewardTokenAmount,
        boosterTokenAmount,
        rewardPerSecond,
        startTimestamp
    };

}

async function main() {

    const dragonswapStakerFactoryAddress = getJson(jsons.addresses)[hre.network.name][
        'DragonswapStakerFactory'
        ];

    const dragonswapStakerFactory = await hre.ethers.getContractAt(
        'DragonswapStakerFactory', dragonswapStakerFactoryAddress
    );

    if(await dragonswapStakerFactory.implBoosted() === ZERO_ADDRESS) {
        const stakerFarmImplFactory = await hre.ethers.getContractFactory('DragonswapStakerBoosted');
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

    const farmConfig = await getFarmConfig();

    const rewardToken = await hre.ethers.getContractAt('Token', farmConfig.rewardTokenAddress);
    const boostedToken = await hre.ethers.getContractAt('Token', farmConfig.boosterTokenAddress);

    const rewardAmount = ethers.utils.parseUnits(farmConfig.rewardTokenAmount, await rewardToken.decimals());
    const boostedAmount = ethers.utils.parseUnits(farmConfig.boosterTokenAmount, await boostedToken.decimals());


    const stakerBoostedFarmTx = await dragonswapStakerFactory.deployBoosted(
        farmConfig.rewardTokenAddress,
        farmConfig.boosterTokenAddress,
        farmConfig.rewardPerSecond,
        farmConfig.startTimestamp
    )

    const stakerBoostedFarmTxReceipt = await stakerBoostedFarmTx.wait()

    const stakerBoostedFarm = await hre.ethers.getContractAt('DragonswapStakerBoosted', stakerBoostedFarmTxReceipt.logs[0].address)

    saveJson(
        jsons.addresses,
        hre.network.name,
        'DragonswapStakerBoosted',
        stakerBoostedFarm.address
    );

    console.log("StakerBoosted farm address: ", stakerBoostedFarm.address);

    await wait();

    await stakerBoostedFarm.add(100, farmConfig.stakeTokenAddress, false)

    console.log('Added pool to stakerBoosted farm');

    await rewardToken.approve(stakerBoostedFarm.address, rewardAmount)
    await wait();
    await boostedToken.approve(stakerBoostedFarm.address, boostedAmount)

    await wait();

    await stakerBoostedFarm.fund(rewardAmount, boostedAmount)

    console.log('StakerBoosted farm funded');

    console.log(`
        Start: ${await stakerBoostedFarm.startTimestamp()}
        End: ${await stakerBoostedFarm.endTimestamp()}
      `);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
