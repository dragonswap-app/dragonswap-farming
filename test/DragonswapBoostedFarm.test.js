const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const {currentTimestamp, advanceTimeAndBlock, mineBlock} = require('./helpers');
const hre = require('hardhat');
const {BigNumber} = require("ethers");
const {formatEther, parseEther, parseUnits} = require("ethers/lib/utils");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const rewardPerSecond = 100;

describe('DragonswapStakerBoosted', () => {
  let lpToken, rewardToken, rewardTokenDecimals,  boosterToken, boosterTokenDecimals;
  let rewardAmount, rewardAmountWei, boosterAmount, boosterAmountWei, rewardPerSecond, rewardPerSecondWei;
  let startTimestamp, endTimestamp;
  let boostedFarm;
  let owner, alice, bob, carl, users;

  // Initialize users
  before(async () => {
    [owner, alice, bob, carl, ...users] = await ethers.getSigners();
  });

  //Initialize tokens
  before(async () => {
    const tokenFactory = await hre.ethers.getContractFactory('Token');

    lpToken = await tokenFactory.connect(owner).deploy("Dragonswap LP", "DLP", 18)
    await lpToken.deployed()

    rewardToken = await tokenFactory.connect(owner).deploy("RewardToken", "RWRD", 18);
    await rewardToken.deployed();

    boosterToken = await tokenFactory.connect(owner).deploy("BoosterToken", "BSTR", 6)
    await boosterToken.deployed();
  });

  // Initialize farm
  before(async () => {
    startTimestamp = await currentTimestamp() + 100;

    rewardTokenDecimals = await rewardToken.decimals();
    boosterTokenDecimals = await boosterToken.decimals();

    rewardAmount = 10000
    boosterAmount = 20000
    rewardAmountWei = parseUnits(rewardAmount.toString(), rewardTokenDecimals);
    boosterAmountWei = parseUnits(boosterAmount.toString(), boosterTokenDecimals);
    rewardPerSecond = 100
    rewardPerSecondWei = parseUnits(rewardPerSecond.toString(), rewardTokenDecimals);


    const boostedFarmFactory = await hre.ethers.getContractFactory('DragonswapStakerBoosted')
    boostedFarm = await boostedFarmFactory.connect(owner).deploy(
        rewardToken.address,
        boosterToken.address,
        rewardPerSecondWei,
        startTimestamp
    )
    await boostedFarm.deployed()

    await boostedFarm.add(15, lpToken.address, false)

    await rewardToken.connect(owner).approve(boostedFarm.address, rewardAmountWei)
    await boosterToken.connect(owner).approve(boostedFarm.address, boosterAmountWei)

    await boostedFarm.connect(owner).fund(rewardAmountWei, boosterAmountWei)
  })

  // Initialize users balances
  before(async () => {
    await lpToken.transfer(alice.address, 5000)
    await lpToken.transfer(bob.address, 1000)
    await lpToken.transfer(carl.address, 2000)
  });

  describe('When created', function () {
    it('Should have correct tokens', async () => {
      expect(await boostedFarm.rewardToken()).eq(rewardToken.address);
      expect(await boostedFarm.boosterToken()).eq(boosterToken.address);
    });

    it('Should have correct reward per second', async () => {
        expect(await boostedFarm.rewardPerSecond()).eq(rewardPerSecondWei);
    });

    it('Should have correct start and end timestamps', async () => {
      expect(await boostedFarm.startTimestamp()).eq(startTimestamp);
      expect(await boostedFarm.endTimestamp()).eq(startTimestamp + rewardAmount / rewardPerSecond);
    });

    it('Should have correct decimals', async () => {
        expect(await boostedFarm.decimalEqReward()).eq(1);
        expect(await boostedFarm.decimalEqBooster()).eq(10 ** (rewardTokenDecimals - boosterTokenDecimals));
    });

    it('Should have correct lp token', async () => {
        const poolLength = await boostedFarm.pools();
        expect(poolLength).eq(1);

        const poolInfo = await boostedFarm.poolInfo(0);
        expect(poolInfo[0]).eq(lpToken.address);
        expect(poolInfo[1]).eq(15);

        const totalAllocPoint = await boostedFarm.totalAllocPoint();
        expect(totalAllocPoint).eq(15);
    });

    it('Should have correct total rewards and booster', async () => {
        expect(await boostedFarm.totalRewards()).eq(rewardAmountWei);
        expect(await boostedFarm.totalBooster()).eq(boosterAmountWei);
    });
  });

  describe('Before the start', function () {
    before(async () => {
      await lpToken.connect(alice).approve(boostedFarm.address, 1500)
      await boostedFarm.connect(alice).deposit(0, 1500);

      await lpToken.connect(bob).approve(boostedFarm.address, 500)
      await boostedFarm.connect(bob).deposit(0, 500);
    });

    it('Allows participants to join', async() => {
      const balanceFarm = await lpToken.balanceOf(boostedFarm.address);
      expect(balanceFarm).eq(2000);

      const balanceAlice = await lpToken.balanceOf(alice.address);
      const depositedAlice = await boostedFarm.deposited(0, alice.address);
      expect(balanceAlice).eq(3500);
      expect(depositedAlice).eq(1500);

      const balanceBob = await lpToken.balanceOf(bob.address);
      const depositedBob = await boostedFarm.deposited(0, bob.address);
      expect(balanceBob).eq(500);
      expect(depositedBob).eq(500);
    });

    it('Does not assign any rewards yet', async () =>{
        const totalPending = await boostedFarm.totalPending();
        expect(totalPending[0]).eq(0);
        expect(totalPending[1]).eq(0);
    });
  });

  describe('After 10 seconds of farming', function () {
    before(async () => {
      await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 10);
    });

    it('Has a total of 1000 rewardTokens and 2000 boosterTokens', async () => {
      const totalPending = await boostedFarm.totalPending();
      expect(totalPending[0]).eq(parseUnits("1000", rewardTokenDecimals));
      expect(totalPending[1]).eq(parseUnits("2000", boosterTokenDecimals));

      console.log('poolInfo', await boostedFarm.poolInfo(0));
      const pendingAlice = await boostedFarm.pending(0, alice.address);
      console.log("pendingAlice", pendingAlice.toString());

      const pendingBob = await boostedFarm.pending(0, bob.address);
        console.log("pendingBob", pendingBob.toString());
    });
  });

});
