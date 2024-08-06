const hre = require('hardhat');
const { getJson, saveJson, sleep, jsons } = require('./utils');
const { ethers } = require('hardhat');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const wait = async () => {await sleep(3000)};

async function getFarmConfig() {

    const classicFarmSettings = getJson(jsons.farmConfig)['classicFarmSettings'];
    const tokenConfig = getJson(jsons.tokenConfig)[hre.network.name]; 

    return {
        stakeTokenAddress: tokenConfig[classicFarmSettings['stakeTokenName']],
        rewardTokenAddress: tokenConfig[classicFarmSettings['rewardTokenName']],
        rewardTokenAmount: classicFarmSettings['rewardTokenAmount'],
        rewardPerSecond: classicFarmSettings['rewardPerSecond'],
        startTimestamp: classicFarmSettings['startTimestamp']
    };
}

async function main() {

    const farmConfig = await getFarmConfig();

    const dragonswapStakerFactoryAddress = getJson(jsons.addresses)[hre.network.name]['DragonswapStakerFactory'];

    const dragonswapStakerFactory = await hre.ethers.getContractAt(
        'DragonswapStakerFactory', dragonswapStakerFactoryAddress
    );

    if(await dragonswapStakerFactory.implClassic() === ZERO_ADDRESS) {
        const stakerFarmImplFactory = await hre.ethers.getContractFactory('DragonswapStaker');
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
    }

    const rewardToken = await hre.ethers.getContractAt('Token', farmConfig.rewardTokenAddress);
    
    const rewardAmount = ethers.utils.parseUnits(farmConfig.rewardTokenAmount, await rewardToken.decimals());

    const stakerFarmTx = await dragonswapStakerFactory.deployClassic(
        farmConfig.rewardTokenAddress,
        farmConfig.rewardPerSecond,
        farmConfig.startTimestamp
    )

    const stakerFarmTxReceipt = await stakerFarmTx.wait()

    const stakerFarm = await hre.ethers.getContractAt('DragonswapStaker', stakerFarmTxReceipt.logs[0].address)

    saveJson(
        jsons.addresses,
        hre.network.name,
        'DragonswapStaker',
        stakerFarm.address
    );

    console.log("Staker farm address: ", stakerFarm.address);

    await wait();

    await stakerFarm.add(100, farmConfig.stakeTokenAddress, false)

    console.log("Staking pool added");

    await rewardToken.approve(stakerFarm.address, rewardAmount)

    await wait();

    await stakerFarm.fund(rewardAmount)
    console.log("Funded staker farm");

    console.log(`
      Start: ${await stakerFarm.startTimestamp()}
      End: ${await stakerFarm.endTimestamp()}
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
