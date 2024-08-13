const hre = require('hardhat');
const { getJson, saveJson, sleep, jsons } = require('./utils');
const { ethers } = require('hardhat');

async function getTokenAndAmount(tokenName, tokenAddress, tokenAmount) {
  const contractName = tokenName === 'WSEI' ? 'WSEI' : 'Token';
  const token = await hre.ethers.getContractAt(contractName, tokenAddress);
  const amount = ethers.utils.parseUnits(tokenAmount, await token.decimals());
  return { token, amount };
}

function getBoostedFarmConfig() {
  const boostedFarmConfig = getJson(jsons.farmConfig)['boostedFarmConfig'];
  const tokenConfig = getJson(jsons.tokenConfig)[hre.network.name];

  return {
    rewardTokenName: boostedFarmConfig['rewardTokenName'],
    boosterTokenName: boostedFarmConfig['boosterTokenName'],
    stakeTokenAddress: tokenConfig[boostedFarmConfig['stakeTokenName']],
    rewardTokenAddress: tokenConfig[boostedFarmConfig['rewardTokenName']],
    boosterTokenAddress: tokenConfig[boostedFarmConfig['boosterTokenName']],
    rewardTokenAmount: boostedFarmConfig['rewardTokenAmount'],
    boosterTokenAmount: boostedFarmConfig['boosterTokenAmount'],
    rewardPerSecond: boostedFarmConfig['rewardPerSecond'],
    startTimestamp: boostedFarmConfig['startTimestamp'],
  };
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const wait = async () => {
  await sleep(3000);
};

async function main() {
  const ownerAddress = process.env.OWNER_ADDRESS;

  const impersonatedSigner = await ethers.getImpersonatedSigner(ownerAddress);

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

  const { token: rewardToken, amount: rewardAmount } = await getTokenAndAmount(
    boostedFarmConfig.rewardTokenName,
    boostedFarmConfig.rewardTokenAddress,
    boostedFarmConfig.rewardTokenAmount
  );
  const { token: boostedToken, amount: boostedAmount } =
    await getTokenAndAmount(
      boostedFarmConfig.boosterTokenName,
      boostedFarmConfig.boosterTokenAddress,
      boostedFarmConfig.boosterTokenAmount
    );

  if (boostedFarmConfig.rewardTokenName === 'WSEI') {
    await rewardToken
      .connect(impersonatedSigner)
      .deposit({ value: rewardAmount });
  }

  if (boostedFarmConfig.boosterTokenName === 'WSEI') {
    await boostedToken
      .connect(impersonatedSigner)
      .deposit({ value: boostedAmount });
  }

  const stakerBoostedFarmTx = await dragonswapStakerFactory
    .connect(impersonatedSigner)
    .deployBoosted(
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

  console.log('StakerBoosted farm address: ', stakerBoostedFarm.address);

  await wait();

  await stakerBoostedFarm
    .connect(impersonatedSigner)
    .add(100, boostedFarmConfig.stakeTokenAddress, false);

  console.log('Added pool to stakerBoosted farm');

  await rewardToken
    .connect(impersonatedSigner)
    .approve(stakerBoostedFarm.address, rewardAmount);
  await wait();
  await boostedToken
    .connect(impersonatedSigner)
    .approve(stakerBoostedFarm.address, boostedAmount);
  await wait();

  await stakerBoostedFarm
    .connect(impersonatedSigner)
    .fund(rewardAmount, boostedAmount);

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
