const hre = require('hardhat');
const { getJson, saveJson, jsons } = require('./utils');
const { ethers } = require('hardhat');
const {currentTimestamp} = require("../test/helpers");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function main() {
    await hre.run('compile');

    const dragonswapStakerFactoryAddress = getJson(jsons.addresses)[hre.network.name][
        'DragonswapStakerFactory'
        ];

    const dragonswapStakerFactory = await hre.ethers.getContractAt(
        'DragonswapStakerFactory', dragonswapStakerFactoryAddress
    );

    if(await dragonswapStakerFactory.implBoosted() === ZERO_ADDRESS) {
        const stakerFarmImplFactory = await hre.ethers.getContractFactory('DragonswapStakerFarm');
        const stakerFarmImplBoosted = await stakerFarmImplFactory.deploy();
        await stakerFarmImplBoosted.deployed();
        console.log(`DragonswapStakerBoosted address: ${stakerFarmImplBoosted.address}`);

        saveJson(
            jsons.addresses,
            hre.network.name,
            'DragonswapStakerImplBoosted',
            stakerFarmImplBoosted.address
        );

        await dragonswapStakerFactory.setImplBoosted(stakerFarmImplBoosted.address);
    }

    const tokenToStakeAddress = getJson(jsons.config)[hre.network.name]['USDC'];

    const rewardTokenAddress = getJson(jsons.config)[hre.network.name]['DSWAP'];
    const rewardToken = await hre.ethers.getContractAt('Token', rewardTokenAddress);

    const boostedTokenAddress = getJson(jsons.config)[hre.network.name]['GLO'];
    const boostedToken = await hre.ethers.getContractAt('Token', boostedTokenAddress);

    const rewardPerSecond = ethers.utils.parseEther('10');
    const startTimestamp = await currentTimestamp() + 120;
    const rewardAmount = ethers.utils.parseUnits('1000000', await rewardToken.decimals());
    const boostedAmount = ethers.utils.parseUnits('1500000', await boostedToken.decimals());

    const stakerBoostedFarmTx = await dragonswapStakerFactory.deployBoosted(
        rewardToken.address,
        boostedToken.address,
        rewardPerSecond,
        startTimestamp
    )

    const stakerBoostedFarmTxReceipt = await stakerBoostedFarmTx.wait()

    const stakerBoostedFarm = await hre.ethers.getContractAt('DragonswapStaker', stakerBoostedFarmTxReceipt.logs[0].address)

    await stakerBoostedFarm.add(100, tokenToStakeAddress, false)

    await rewardToken.approve(stakerBoostedFarm.address, rewardAmount)
    await boostedToken.approve(stakerBoostedFarm.address, boostedAmount)

    await stakerBoostedFarm.fund(rewardAmount, boostedAmount)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
