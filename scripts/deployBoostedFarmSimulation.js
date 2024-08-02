const hre = require('hardhat');
const { getJson, saveJson, sleep, jsons } = require('./utils');
const { ethers } = require('hardhat');

async function getTokenAndAmount(tokenName, tokenAddress, tokenAmount) {
    const contractName = tokenName === 'WSEI' ? 'WSEI' : 'Token';
    const token = await hre.ethers.getContractAt(contractName, tokenAddress);
    const amount = ethers.utils.parseUnits(tokenAmount, await token.decimals());
    return { token, amount };
}

async function getFarmConfig() {

    const boostedFarmSettings = getJson(jsons.farmConfig)['boostedFarmSettings'];
    const tokenConfig = getJson(jsons.tokenConfig)[hre.network.name];

    const stakeTokenName = boostedFarmSettings['stakeTokenName'];
    const rewardTokenName = boostedFarmSettings['rewardTokenName'];
    const boosterTokenName = boostedFarmSettings['boosterTokenName'];

    const stakeTokenAddress = tokenConfig[stakeTokenName];
    const rewardTokenAddress = tokenConfig[rewardTokenName];
    const boosterTokenAddress = tokenConfig[boosterTokenName];
    const rewardTokenAmount = boostedFarmSettings['rewardTokenAmount'];
    const boosterTokenAmount = boostedFarmSettings['boosterTokenAmount'];
    const rewardPerSecond = boostedFarmSettings['rewardPerSecond'];
    const startTimestamp = boostedFarmSettings['startTimestamp'];

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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const wait = async () => {await sleep(3000)};

async function main() {
    const ownerAddress = process.env.OWNER_ADDRESS;

    const impersonatedSigner = await ethers.getImpersonatedSigner(ownerAddress);

    const farmConfig = await getFarmConfig();

    const dragonswapStakerFactoryAddress = getJson(jsons.addresses)[hre.network.name]['DragonswapStakerFactory'];

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

    const { token: rewardToken, amount: rewardAmount } = await getTokenAndAmount(farmConfig.rewardTokenName, farmConfig.rewardTokenAddress, farmConfig.rewardTokenAmount);
    const { token: boostedToken, amount: boostedAmount } = await getTokenAndAmount(farmConfig.boosterTokenName, farmConfig.boosterTokenAddress, farmConfig.boosterTokenAmount);

    if (farmConfig.rewardTokenName === 'WSEI') {
        await rewardToken.connect(impersonatedSigner).deposit({ value: rewardAmount });
    }
    
    if (farmConfig.boosterTokenName === 'WSEI') {
        await boostedToken.connect(impersonatedSigner).deposit({ value: boostedAmount });
    }

    const stakerBoostedFarmTx = await dragonswapStakerFactory.connect(impersonatedSigner).deployBoosted(
        farmConfig.rewardTokenAddress,
        farmConfig.boosterTokenAddress,
        farmConfig.rewardPerSecond,
        farmConfig.startTimestamp
    )

    const stakerBoostedFarmTxReceipt = await stakerBoostedFarmTx.wait()

    const stakerBoostedFarm = await hre.ethers.getContractAt('DragonswapStakerBoosted', stakerBoostedFarmTxReceipt.logs[0].address)

    console.log("StakerBoosted farm address: ", stakerBoostedFarm.address);

    await wait();

    await stakerBoostedFarm.connect(impersonatedSigner).add(100, farmConfig.stakeTokenAddress, false)

    console.log('Added pool to stakerBoosted farm');

    await rewardToken.connect(impersonatedSigner).approve(stakerBoostedFarm.address, rewardAmount)
    await wait();
    await boostedToken.connect(impersonatedSigner).approve(stakerBoostedFarm.address, boostedAmount)
    await wait();

    await stakerBoostedFarm.connect(impersonatedSigner).fund(rewardAmount, boostedAmount)

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