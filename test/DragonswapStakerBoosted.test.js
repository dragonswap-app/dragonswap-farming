const { ethers } = require('hardhat');
const { expect } = require('chai');
const { blockTimestamp, increaseTime } = require('./utils');

describe('Dragonswap Staker Boosted', function () {
  let deployer, users;
  let pooledToken, rewardToken, boosterToken;
  let stakerContract;
  let startTimestamp, endTimestamp;

  const rewardPerSecond = ethers.utils.parseEther('0.005');
  const rewardsToFund = ethers.utils.parseEther('100000');
  const boosterToFund = ethers.utils.parseEther('50000');
  const fundsToStake = ethers.utils.parseEther('20');
  const fundsToStakeAlice = ethers.utils.parseEther('5');

  before(async () => {
    [deployer, alice, bob, ...users] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory('Token');

    pooledToken = await tokenFactory.deploy();
    await pooledToken.deployed();

    rewardToken = await tokenFactory.deploy();
    await rewardToken.deployed();

    boosterToken = await tokenFactory.deploy();
    await boosterToken.deployed();

    // send tokens to alice
    await pooledToken.transfer(alice.address, fundsToStakeAlice);

    startTimestamp = (await blockTimestamp()) + 10;

    const stakerBoostedFactory = await ethers.getContractFactory(
      'DragonswapStakerBoosted'
    );
    stakerContract = await stakerBoostedFactory.deploy(
      rewardToken.address,
      boosterToken.address,
      rewardPerSecond,
      startTimestamp
    );
  });

  it('Should fund the contract', async () => {
    await rewardToken.approve(stakerContract.address, rewardsToFund);
    await boosterToken.approve(stakerContract.address, boosterToFund);
    // Fund with ratio 2:1
    expect(await stakerContract.fund(rewardsToFund, boosterToFund))
      .to.emit(stakerContract, 'Funded')
      .withArgs(deployer.address, rewardsToFund, boosterToFund);

    endTimestamp = rewardsToFund.div(rewardPerSecond).add(startTimestamp);
    expect(await stakerContract.endTimestamp()).to.equal(endTimestamp);
  });

  it('Should add pool', async () => {
    await stakerContract.add(100, pooledToken.address, false)
  });

  it('Should stake tokens', async () => {
    // deployer
    await pooledToken.approve(stakerContract.address, fundsToStake);
    expect(await stakerContract.deposit(0, fundsToStake))
      .to.emit(stakerContract, 'Deposited')
      .withArgs(deployer.address, fundsToStake);

    // alice
    await pooledToken.connect(alice).approve(stakerContract.address, fundsToStakeAlice);
    expect(await stakerContract.connect(alice).deposit(0, fundsToStakeAlice))
      .to.emit(stakerContract, 'Deposited')
      .withArgs(alice.address, fundsToStakeAlice);
  });

  it('Check pending', async () => {
    console.log(await blockTimestamp(), startTimestamp);
    await increaseTime(startTimestamp - await blockTimestamp() + 10);
    console.log(await blockTimestamp(), startTimestamp);
    await stakerContract.updatePool(0);
    console.log(
        await stakerContract.poolInfo(0),
        await stakerContract.ratio(),
        await stakerContract.pending(0, deployer.address),
        await stakerContract.pending(0, alice.address),
        await stakerContract.totalPending()
    );
  });
});
