const hre = require('hardhat');
const { getJson, saveJson, sleep, jsons } = require('./utils');
const { ethers } = require('hardhat');
const {currentTimestamp} = require("../test/helpers");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const wait = async () => {await sleep(3000)};

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

    const tokenToStakeAddress = getJson(jsons.config)[hre.network.name]['USDC'];

    const rewardTokenAddress = getJson(jsons.config)[hre.network.name]['DSWAP'];
    const rewardToken = await hre.ethers.getContractAt('Token', rewardTokenAddress);

    const boostedTokenAddress = getJson(jsons.config)[hre.network.name]['GLO'];
    const boostedToken = await hre.ethers.getContractAt('Token', boostedTokenAddress);

    const rewardPerSecond = ethers.utils.parseEther('0.0858148148148');
    const startTimestamp = await currentTimestamp() + 120;
    const rewardAmount = ethers.utils.parseUnits('60000', await rewardToken.decimals());
    const boostedAmount = ethers.utils.parseUnits('80000', await boostedToken.decimals());

    const stakerBoostedFarmTx = await dragonswapStakerFactory.deployBoosted(
        rewardToken.address,
        boostedToken.address,
        rewardPerSecond,
        startTimestamp
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

    await stakerBoostedFarm.add(100, tokenToStakeAddress, false)

    console.log('Added pool to stakerBoosted farm');

    await rewardToken.approve(stakerBoostedFarm.address, rewardAmount)
    await wait();
    await boostedToken.approve(stakerBoostedFarm.address, boostedAmount)

    await wait();

    await stakerBoostedFarm.fund(rewardAmount, boostedAmount)

    console.log('StakerBoosted farm funded');

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
