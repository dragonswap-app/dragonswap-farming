const { ethers } = require('hardhat');
const { expect } = require('chai');
const hre = require('hardhat');
const { currentTimestamp } = require('./helpers');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe('ArborSalesFactory', () => {
  let users;
  let deployer_one;
  let deployer_two;
  let stakerFactory;
  let rewardToken;
  let boosterToken;
  let owner_one;
  let owner_two;
  let rewardPerSecond;
  let startTimestamp;

  before(async () => {
    [owner_one, owner_two, deployer_one, deployer_two, ...users] =
      await ethers.getSigners();

    rewardPerSecond = ethers.utils.parseEther('100');
    startTimestamp = (await currentTimestamp()) + 100;

    tokenFactory = await ethers.getContractFactory('Token');
    rewardToken = await tokenFactory
      .connect(users[0])
      .deploy('RewardToken', 'RWDT', 18);
    await rewardToken.deployed();

    boosterToken = await tokenFactory
      .connect(users[0])
      .deploy('BoosterToken', 'BST', 18);
    await boosterToken.deployed();
  });

  it('Should initialize correctly', async () => {
    const dragonswapStakerFactory = await ethers.getContractFactory(
      'DragonswapStakerFactory'
    );

    stakerFactory = await dragonswapStakerFactory.deploy(owner_one.address);
    await stakerFactory.deployed();

    expect(await stakerFactory.owner()).to.equal(owner_one.address);
  });

  it('Should set classic implementation address correctly', async () => {
    stakerFarmFactory = await hre.ethers.getContractFactory('DragonswapStaker');
    stakerFarm = await stakerFarmFactory.deploy();
    await stakerFarm.deployed();

    await stakerFactory.setImplementationClassic(stakerFarm.address);

    expect(await stakerFactory.implClassic())
      .to.equal(stakerFarm.address)
      .to.emit(stakerFactory, 'ImplementationSet')
      .withArgs(stakerFarm.address, 1);
  });

  it('Should fail to set classic implementation address if msg.sender is not owner', async () => {
    await expect(
      stakerFactory
        .connect(owner_two)
        .setImplementationClassic(stakerFarm.address)
    )
      .to.be.revertedWith('OwnableUnauthorizedAccount')
      .withArgs(owner_two.address);
  });

  it('Should fail to set classic implementation address if implementation address is set with the same address', async () => {
    stakerFarmFactory = await hre.ethers.getContractFactory('DragonswapStaker');
    stakerFarm = await stakerFarmFactory.deploy();
    await stakerFarm.deployed();

    await stakerFactory.setImplementationClassic(stakerFarm.address);

    expect(await stakerFactory.implClassic())
      .to.equal(stakerFarm.address)
      .to.emit(stakerFactory, 'ImplementationSet')
      .withArgs(stakerFarm.address);

    await expect(
      stakerFactory.setImplementationClassic(stakerFarm.address)
    ).to.be.revertedWith('ImplementationAlreadySet');
  });

  it('Should deploy classic farm correctly', async () => {
    await expect(
      stakerFactory.deployClassic(
        rewardToken.address,
        rewardPerSecond,
        startTimestamp
      )
    ).to.emit(stakerFactory, 'Deployed');
  });

  it('Should fail to deploy classic farm correctly due to msg.sender not being an owner', async () => {
    await expect(
      stakerFactory
        .connect(owner_two)
        .deployClassic(rewardToken.address, rewardPerSecond, startTimestamp)
    )
      .to.be.revertedWith('OwnableUnauthorizedAccount')
      .withArgs(owner_two.address);
  });

  it('Should fail to deploy classic farm correctly due to implementation being set as zero address', async () => {
    await stakerFactory.setImplementationClassic(ZERO_ADDRESS);

    await expect(
      stakerFactory.deployClassic(
        rewardToken.address,
        rewardPerSecond,
        startTimestamp
      )
    ).to.be.revertedWith('ImplementationNotSet');
  });

  it('Should confirm that classic farm is deployed through our factory', async () => {
    stakerFarmFactory = await hre.ethers.getContractFactory('DragonswapStaker');
    stakerFarm = await stakerFarmFactory.deploy();
    await stakerFarm.deployed();

    await stakerFactory.setImplementationClassic(stakerFarm.address);

    await stakerFactory.deployClassic(
      rewardToken.address,
      rewardPerSecond,
      startTimestamp
    );

    SALE_ADDRESS = await stakerFactory.getLatestDeployment();

    expect(await stakerFactory.isDeployedThroughFactory(SALE_ADDRESS)).to.be
      .true;
  });

  it('Should confirm that classic farm is not deployed through our factory', async () => {
    newDragonswapStakerFactory = await ethers.getContractFactory(
      'DragonswapStakerFactory'
    );

    newStakerFactory = await newDragonswapStakerFactory.deploy(
      owner_one.address
    );
    await newStakerFactory.deployed();

    stakerFarmFactory = await hre.ethers.getContractFactory('DragonswapStaker');
    stakerFarm = await stakerFarmFactory.deploy();
    await stakerFarm.deployed();

    await newStakerFactory.setImplementationClassic(stakerFarm.address);

    await newStakerFactory.deployClassic(
      rewardToken.address,
      rewardPerSecond,
      startTimestamp
    );

    SALE_ADDRESS = await newStakerFactory.getLatestDeployment();

    expect(await stakerFactory.isDeployedThroughFactory(SALE_ADDRESS)).to.be
      .false;
  });

  it('Should set boosted implementation address correctly', async () => {
    stakerBoostedFarmFactory = await hre.ethers.getContractFactory(
      'DragonswapStakerBoosted'
    );
    stakerBoostedFarm = await stakerBoostedFarmFactory.deploy();
    await stakerBoostedFarm.deployed();

    await stakerFactory.setImplementationBoosted(stakerBoostedFarm.address);

    expect(await stakerFactory.implBoosted())
      .to.equal(stakerBoostedFarm.address)
      .to.emit(stakerFactory, 'ImplementationSet')
      .withArgs(stakerBoostedFarm.address, 1);
  });

  it('Should fail to set boosted implementation address if msg.sender is not owner', async () => {
    await expect(
      stakerFactory
        .connect(owner_two)
        .setImplementationBoosted(stakerFarm.address)
    )
      .to.be.revertedWith('OwnableUnauthorizedAccount')
      .withArgs(owner_two.address);
  });

  it('Should fail to set boosted implementation address if implementation address is set with the same address', async () => {
    stakerBoostedFarmFactory = await hre.ethers.getContractFactory(
      'DragonswapStakerBoosted'
    );
    stakerBoostedFarm = await stakerBoostedFarmFactory.deploy();
    await stakerBoostedFarm.deployed();

    await stakerFactory.setImplementationBoosted(stakerBoostedFarm.address);

    expect(await stakerFactory.implBoosted())
      .to.equal(stakerBoostedFarm.address)
      .to.emit(stakerFactory, 'ImplementationSet')
      .withArgs(stakerBoostedFarm.address);

    await expect(
      stakerFactory.setImplementationBoosted(stakerBoostedFarm.address)
    ).to.be.revertedWith('ImplementationAlreadySet');
  });

  it('Should check number of farm deployments for factory', async () => {
    expect(await stakerFactory.noOfDeployments()).to.equal(2);
  });

  it('Should deploy boosted farm correctly', async () => {
    await expect(
      stakerFactory.deployBoosted(
        rewardToken.address,
        boosterToken.address,
        rewardPerSecond,
        startTimestamp
      )
    ).to.emit(stakerFactory, 'Deployed');
  });

  it('Should fail to deploy boosted farm correctly due to msg.sender not being an owner', async () => {
    await expect(
      stakerFactory
        .connect(owner_two)
        .deployBoosted(
          rewardToken.address,
          boosterToken.address,
          rewardPerSecond,
          startTimestamp
        )
    )
      .to.be.revertedWith('OwnableUnauthorizedAccount')
      .withArgs(owner_two.address);
  });

  it('Should fail to deploy boosted farm correctly due to implementation being set as zero address', async () => {
    await stakerFactory.setImplementationBoosted(ZERO_ADDRESS);

    await expect(
      stakerFactory.deployBoosted(
        rewardToken.address,
        boosterToken.address,
        rewardPerSecond,
        startTimestamp
      )
    ).to.be.revertedWith('ImplementationNotSet');
  });

  it('Should confirm that boosted farm is deployed through our factory', async () => {
    stakerBoostedFarmFactory = await hre.ethers.getContractFactory(
      'DragonswapStakerBoosted'
    );
    stakerBoostedFarm = await stakerBoostedFarmFactory.deploy();
    await stakerBoostedFarm.deployed();

    await stakerFactory.setImplementationBoosted(stakerBoostedFarm.address);

    await stakerFactory.deployBoosted(
      rewardToken.address,
      boosterToken.address,
      rewardPerSecond,
      startTimestamp
    );

    SALE_ADDRESS = await stakerFactory.getLatestDeployment();

    expect(await stakerFactory.isDeployedThroughFactory(SALE_ADDRESS)).to.be
      .true;
  });

  it('Should confirm that boosted farm is not deployed through our factory', async () => {
    newDragonswapStakerFactory = await ethers.getContractFactory(
      'DragonswapStakerFactory'
    );

    newStakerFactory = await newDragonswapStakerFactory.deploy(
      owner_one.address
    );
    await newStakerFactory.deployed();

    stakerBoostedFarmFactory = await hre.ethers.getContractFactory(
      'DragonswapStakerBoosted'
    );
    stakerBoostedFarm = await stakerBoostedFarmFactory.deploy();
    await stakerBoostedFarm.deployed();

    await newStakerFactory.setImplementationBoosted(stakerBoostedFarm.address);

    await newStakerFactory.deployBoosted(
      rewardToken.address,
      boosterToken.address,
      rewardPerSecond,
      startTimestamp
    );

    SALE_ADDRESS = await newStakerFactory.getLatestDeployment();

    expect(await stakerFactory.isDeployedThroughFactory(SALE_ADDRESS)).to.be
      .false;
  });

  it('Should get latest deployment address', async () => {
    const newStakerFarm = await stakerFactory.deployClassic(
      rewardToken.address,
      rewardPerSecond,
      startTimestamp
    );
    const newStakerFarmReceipt = await newStakerFarm.wait();
    const newStakerFarmAddress = newStakerFarmReceipt.logs[0].address;

    expect(await stakerFactory.getLatestDeployment()).to.equal(
      newStakerFarmAddress
    );
  });

  it('Should get zero address if there is no deployments', async () => {
    newDragonswapStakerFactory = await ethers.getContractFactory(
      'DragonswapStakerFactory'
    );

    newStakerFactory = await newDragonswapStakerFactory.deploy(
      owner_one.address
    );
    await newStakerFactory.deployed();

    expect(await newStakerFactory.getLatestDeployment()).equals(ZERO_ADDRESS);
  });

  it('Should get all deployments', async () => {
    numberOfDeployments = await stakerFactory.noOfDeployments();
    expect(
      await stakerFactory.getAllDeployments(0, numberOfDeployments - 1)
    ).to.have.lengthOf(5);
  });

  it('Should fail to get all deployments due to start index being greater than end index', async () => {
    numberOfDeployments = await stakerFactory.noOfDeployments();
    await expect(stakerFactory.getAllDeployments(1, 0)).to.be.revertedWith(
      'InvalidIndexRange'
    );
  });

  it('Should fail to get all deployments due to end index being greater than number of actual deployments', async () => {
    numberOfDeployments = await stakerFactory.noOfDeployments();
    await expect(
      stakerFactory.getAllDeployments(1, numberOfDeployments)
    ).to.be.revertedWith('InvalidIndexRange');
  });

  it('Should set new owner correctly', async () => {
    await stakerFactory.transferOwnership(owner_two.address);
    expect(await stakerFactory.owner())
      .equals(owner_two.address)
      .to.emit(stakerFactory, 'OwnershipTransferred')
      .withArgs(owner_one.address, owner_two.address);
  });
  //
  it('Should fail to set new owner correctly due not msg.sender not being owner', async () => {
    await expect(
      stakerFactory.transferOwnership(owner_one.address)
    ).to.be.revertedWith('OwnableUnauthorizedAccount');
  });

  it('Should fail to set new owner correctly due to zero address', async () => {
    await expect(
      stakerFactory.connect(owner_two).transferOwnership(ZERO_ADDRESS)
    )
      .to.be.revertedWith('OwnableInvalidOwner')
      .withArgs(ZERO_ADDRESS);
  });
});
