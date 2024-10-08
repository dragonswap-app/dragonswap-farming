const hre = require('hardhat');
const { getJson, saveJson, sleep, jsons } = require('./utils');
const { ethers } = require('hardhat');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const wait = async () => {
  await sleep(3000);
};

function getBoostedFarmConfig() {
  const boostedFarmConfig = getJson(jsons.farmConfig)['boostedFarmConfig'];
  const tokenConfig = getJson(jsons.tokenConfig)[hre.network.name];

  return {
    stakeTokenAddress: tokenConfig[boostedFarmConfig['stakeTokenName']],
    rewardTokenAddress: tokenConfig[boostedFarmConfig['rewardTokenName']],
    boosterTokenAddress: tokenConfig[boostedFarmConfig['boosterTokenName']],
    rewardTokenAmount: boostedFarmConfig['rewardTokenAmount'],
    boosterTokenAmount: boostedFarmConfig['boosterTokenAmount'],
    rewardPerSecond: boostedFarmConfig['rewardPerSecond'],
    startTimestamp: boostedFarmConfig['startTimestamp'],
  };
}

async function main() {
  const boostedFarmConfig = getBoostedFarmConfig();

  const dragonswapStakerFactoryAddress = getJson(jsons.addresses)[
    hre.network.name
  ]['DragonswapStakerFactory'];

  const dragonswapStakerFactory = await hre.ethers.getContractAt(
    'DragonswapStakerFactory',
    dragonswapStakerFactoryAddress
  );

  if ((await dragonswapStakerFactory.implBoosted()) === ZERO_ADDRESS) {
    const stakerFarmImplFactory = await hre.ethers.getContractFactory(
      'DragonswapStakerBoosted'
    );
    const stakerFarmImplBoosted = await stakerFarmImplFactory.deploy();
    await stakerFarmImplBoosted.deployed();
    console.log(
      `DragonswapStakerBoosted address: ${stakerFarmImplBoosted.address}`
    );

    saveJson(
      jsons.addresses,
      hre.network.name,
      'DragonswapStakerImplBoosted',
      stakerFarmImplBoosted.address
    );

    await dragonswapStakerFactory.setImplementationBoosted(
      stakerFarmImplBoosted.address
    );
    console.log('Boosted implementation set on factory');
  }

  const rewardToken = await hre.ethers.getContractAt(
    'Token',
    boostedFarmConfig.rewardTokenAddress
  );
  const boostedToken = await hre.ethers.getContractAt(
    'Token',
    boostedFarmConfig.boosterTokenAddress
  );

  const rewardAmount = ethers.utils.parseUnits(
    boostedFarmConfig.rewardTokenAmount,
    await rewardToken.decimals()
  );
  const boostedAmount = ethers.utils.parseUnits(
    boostedFarmConfig.boosterTokenAmount,
    await boostedToken.decimals()
  );

  const stakerBoostedFarmTx = await dragonswapStakerFactory.deployBoosted(
    boostedFarmConfig.rewardTokenAddress,
    boostedFarmConfig.boosterTokenAddress,
    boostedFarmConfig.rewardPerSecond,
    boostedFarmConfig.startTimestamp
  );

  const stakerBoostedFarmTxReceipt = await stakerBoostedFarmTx.wait();

  const stakerBoostedFarm = await hre.ethers.getContractAt(
    'DragonswapStakerBoosted',
    stakerBoostedFarmTxReceipt.logs[0].address
  );

  saveJson(
    jsons.addresses,
    hre.network.name,
    'DragonswapStakerBoosted',
    stakerBoostedFarm.address
  );

  console.log('StakerBoosted farm address: ', stakerBoostedFarm.address);

  await wait();

  await stakerBoostedFarm.add(100, boostedFarmConfig.stakeTokenAddress, false);

  console.log('Added pool to stakerBoosted farm');

  await rewardToken.approve(stakerBoostedFarm.address, rewardAmount);
  await wait();
  await boostedToken.approve(stakerBoostedFarm.address, boostedAmount);

  await wait();

  await stakerBoostedFarm.fund(rewardAmount, boostedAmount);

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
