const hre = require('hardhat');
const { getJson, saveJson, sleep, jsons } = require('./utils');
const { ethers } = require('hardhat');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const wait = async () => {
  await sleep(3000);
};

function getClassicFarmConfig() {
  const classicFarmConfig = getJson(jsons.farmConfig)['classicFarmConfig'];
  const tokenConfig = getJson(jsons.tokenConfig)[hre.network.name];

  return {
    rewardTokenName: classicFarmConfig['rewardTokenName'],
    stakeTokenAddress: tokenConfig[classicFarmConfig['stakeTokenName']],
    rewardTokenAddress: tokenConfig[classicFarmConfig['rewardTokenName']],
    rewardTokenAmount: classicFarmConfig['rewardTokenAmount'],
    rewardPerSecond: classicFarmConfig['rewardPerSecond'],
    startTimestamp: classicFarmConfig['startTimestamp'],
  };
}

async function main() {
  const ownerAddress = process.env.OWNER_ADDRESS;

  const impersonatedSigner = await ethers.getImpersonatedSigner(ownerAddress);

  const classicFarmConfig = getClassicFarmConfig();

  const dragonswapStakerFactoryAddress = getJson(jsons.addresses)[
    hre.network.name
  ]['DragonswapStakerFactory'];

  const dragonswapStakerFactory = await hre.ethers.getContractAt(
    'DragonswapStakerFactory',
    dragonswapStakerFactoryAddress
  );

  if ((await dragonswapStakerFactory.implClassic()) === ZERO_ADDRESS) {
    const stakerFarmImplFactory =
      await hre.ethers.getContractFactory('DragonswapStaker');
    const stakerFarmImplClassic = await stakerFarmImplFactory
      .connect(impersonatedSigner)
      .deploy();
    await stakerFarmImplClassic.deployed();
    console.log(`DragonswapStaker address: ${stakerFarmImplClassic.address}`);

    saveJson(
      jsons.addresses,
      hre.network.name,
      'DragonswapStakerImplClassic',
      stakerFarmImplClassic.address
    );

    await dragonswapStakerFactory
      .connect(impersonatedSigner)
      .setImplementationClassic(stakerFarmImplClassic.address);
    console.log('Classic implementation set on factory');
  }

  let rewardAmount;
  let rewardToken;

  const rewardTokenName =
    classicFarmConfig.rewardTokenName === 'WSEI' ? 'WSEI' : 'Token';
  rewardToken = await hre.ethers.getContractAt(
    rewardTokenName,
    classicFarmConfig.rewardTokenAddress
  );
  rewardAmount = ethers.utils.parseUnits(
    classicFarmConfig.rewardTokenAmount,
    await rewardToken.decimals()
  );

  if (rewardTokenName === 'WSEI') {
    await rewardToken
      .connect(impersonatedSigner)
      .deposit({ value: rewardAmount });
  }

  const stakerFarmTx = await dragonswapStakerFactory
    .connect(impersonatedSigner)
    .deployClassic(
      classicFarmConfig.rewardTokenAddress,
      classicFarmConfig.rewardPerSecond,
      classicFarmConfig.startTimestamp
    );

  const stakerFarmTxReceipt = await stakerFarmTx.wait();

  const stakerFarm = await hre.ethers.getContractAt(
    'DragonswapStaker',
    stakerFarmTxReceipt.logs[0].address
  );

  console.log('Staker farm address: ', stakerFarm.address);

  await wait();

  await stakerFarm
    .connect(impersonatedSigner)
    .add(100, classicFarmConfig.stakeTokenAddress, false);

  console.log('Staking pool added');

  await rewardToken
    .connect(impersonatedSigner)
    .approve(stakerFarm.address, rewardAmount);

  await wait();
  await stakerFarm.connect(impersonatedSigner).fund(rewardAmount);
  console.log('Funded staker farm');

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
