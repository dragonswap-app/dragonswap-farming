const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

describe("Dragonswap Revenue-share Staking", () => {
  before(async () => {
    this.stakerFactory = await ethers.getContractFactory(
      "DragonswapRevenueShareStaking"
    );
    this.tokenFactory = await ethers.getContractFactory("Token");

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.carol = this.signers[3];
    this.rewardDistributor = this.signers[4];
    this.treasury = this.signers[5];
  });

  beforeEach(async () => {
    this.rewardToken = await this.tokenFactory.deploy("Tether", "USDT", 6);
    this.dragon = await this.tokenFactory.deploy("Dragonswap", "DS", 18);

    await this.dragon.mint(this.alice.address, ethers.utils.parseEther("1000"));
    await this.dragon.mint(this.bob.address, ethers.utils.parseEther("1000"));
    await this.dragon.mint(this.carol.address, ethers.utils.parseEther("1000"));
    await this.rewardToken.mint(
      this.rewardDistributor.address,
      ethers.utils.parseEther("1000000")
    ); // 1_000_000 tokens

    this.dragonStaker = await this.stakerFactory.deploy(
      this.dragon.address,
      this.rewardToken.address,
      this.treasury.address,
      300, // 3%
    );

    await this.dragonStaker.deployed();

    await this.dragon
      .connect(this.alice)
      .approve(
        this.dragonStaker.address,
        ethers.utils.parseEther("100000")
      );
    await this.dragon
      .connect(this.bob)
      .approve(
        this.dragonStaker.address,
        ethers.utils.parseEther("100000")
      );
    await this.dragon
      .connect(this.carol)
      .approve(
        this.dragonStaker.address,
        ethers.utils.parseEther("100000")
      );
  });

  describe("should allow deposits and withdraws", () => {
    it("should allow deposits and withdraws of multiple users", async () => {
      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("900")
      );
      expect(
        await this.dragon.balanceOf(this.dragonStaker.address)
      ).to.be.equal(ethers.utils.parseEther("100"));
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("97"));
      // 100 * 0.97 = 97
      expect(
        await this.dragonStaker.fees()
      ).to.be.equal(ethers.utils.parseEther("3"));
      expect(
        (
          await this.dragonStaker.getUserInfo(
            this.alice.address,
            this.dragon.address
          )
        )[0]
      ).to.be.equal(ethers.utils.parseEther("97"));

      await this.dragonStaker
        .connect(this.bob)
        .deposit(ethers.utils.parseEther("200"));
      expect(await this.dragon.balanceOf(this.bob.address)).to.be.equal(
        ethers.utils.parseEther("800")
        // 97 + 200 * 0.97 = 291
      );
      expect(
        await this.dragon.balanceOf(this.dragonStaker.address)
      ).to.be.equal(ethers.utils.parseEther("300"));
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("291"));
      expect(
        await this.dragonStaker.fees()
      ).to.be.equal(ethers.utils.parseEther("9"));
      // 3 + 200 * 0.03 = 9
      expect(
        (
          await this.dragonStaker.getUserInfo(
            this.bob.address,
            this.dragon.address
          )
        )[0]
      ).to.be.equal(ethers.utils.parseEther("194"));

      await this.dragonStaker
        .connect(this.carol)
        .deposit(ethers.utils.parseEther("300"));
      expect(await this.dragon.balanceOf(this.carol.address)).to.be.equal(
        ethers.utils.parseEther("700")
      );
      // 291 + 300 * 0.97
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("582"));
      expect(
        (
          await this.dragonStaker.getUserInfo(
            this.carol.address,
            this.dragon.address
          )
        )[0]
      ).to.be.equal(ethers.utils.parseEther("291"));

      await this.dragonStaker
        .connect(this.alice)
        .withdraw(ethers.utils.parseEther("97"));
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("997")
      );
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("485"));
      expect(
        (
          await this.dragonStaker.getUserInfo(
            this.alice.address,
            this.dragon.address
          )
        )[0]
      ).to.be.equal(0);

      await this.dragonStaker
        .connect(this.carol)
        .withdraw(ethers.utils.parseEther("100"));
      expect(await this.dragon.balanceOf(this.carol.address)).to.be.equal(
        ethers.utils.parseEther("800")
      );
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("385"));
      expect(
        (
          await this.dragonStaker.getUserInfo(
            this.carol.address,
            this.dragon.address
          )
        )[0]
      ).to.be.equal(ethers.utils.parseEther("191"));

      await this.dragonStaker.connect(this.bob).withdraw("1");
      expect(await this.dragon.balanceOf(this.bob.address)).to.be.equal(
        ethers.utils.parseEther("800.000000000000000001")
      );
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("384.999999999999999999"));
      expect(
        (
          await this.dragonStaker.getUserInfo(
            this.bob.address,
            this.dragon.address
          )
        )[0]
      ).to.be.equal(ethers.utils.parseEther("193.999999999999999999"));
    });

    it("should update variables accordingly", async () => {
      await this.dragonStaker.connect(this.alice).deposit("1");

      await this.rewardToken
        .connect(this.rewardDistributor)
        .transfer(this.dragonStaker.address, ethers.utils.parseEther("1"));
      expect(
        await this.rewardToken.balanceOf(this.dragonStaker.address)
      ).to.be.equal(ethers.utils.parseEther("1"));
      expect(
        await this.dragonStaker.lastRewardBalance(this.rewardToken.address)
      ).to.be.equal("0");
      expect(
        await this.dragonStaker.pendingRewards(
          this.alice.address,
          this.rewardToken.address
        )
      ).to.be.equal(ethers.utils.parseEther("1"));

      // Making sure that `pendingRewards` still return the accurate tokens even after updating pools
      await this.dragonStaker.connect(this.alice).deposit("1");

      expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("1")
      );

      expect(
        await this.dragonStaker.pendingRewards(
          this.alice.address,
          this.rewardToken.address
        )
      ).to.be.equal(ethers.utils.parseEther("0"));

      await this.rewardToken
        .connect(this.rewardDistributor)
        .transfer(this.dragonStaker.address, ethers.utils.parseEther("1"));

      // Should be equal to 2, the previous reward and the new one
      expect(
        await this.dragonStaker.pendingRewards(
          this.alice.address,
          this.rewardToken.address
        )
      ).to.be.equal(ethers.utils.parseEther("1"));

      // Making sure that `pendingRewards` still return the accurate tokens even after updating pools
      await this.dragonStaker.connect(this.alice).deposit("1");

      expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("2")
      );

      expect(
        await this.dragonStaker.pendingRewards(
          this.alice.address,
          this.rewardToken.address
        )
      ).to.be.equal(ethers.utils.parseEther("0"));
    });

    it("should allow deposits and withdraws of multiple users and distribute rewards accordingly", async () => {
      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));
      await this.dragonStaker
        .connect(this.bob)
        .deposit(ethers.utils.parseEther("200"));
      await this.dragonStaker
        .connect(this.carol)
        .deposit(ethers.utils.parseEther("300"));

      await this.rewardToken
        .connect(this.rewardDistributor)
        .transfer(this.dragonStaker.address, ethers.utils.parseEther("6"));

      await this.dragonStaker
        .connect(this.alice)
        .withdraw(ethers.utils.parseEther("97"));
      // accRewardBalance = rewardBalance * PRECISION / totalStaked
      //                  = 6e18 * 1e24 / 582e18
      //                  = 0.010309278350515463917525e24
      // reward = accRewardBalance * aliceShare / PRECISION
      //        = accRewardBalance * 97e18 / 1e24
      //        = 0.999999999999999999e18
      expect(
        await this.rewardToken.balanceOf(this.alice.address)
      ).to.be.closeTo(
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("0.0001")
      );

      await this.dragonStaker
        .connect(this.carol)
        .withdraw(ethers.utils.parseEther("100"));
      expect(await this.dragon.balanceOf(this.carol.address)).to.be.equal(
        ethers.utils.parseEther("800")
      );
      // reward = accRewardBalance * carolShare / PRECISION
      //        = accRewardBalance * 291e18 / 1e24
      //        = 2.999999999999999999e18
      expect(
        await this.rewardToken.balanceOf(this.carol.address)
      ).to.be.closeTo(
        ethers.utils.parseEther("3"),
        ethers.utils.parseEther("0.0001")
      );

      await this.dragonStaker.connect(this.bob).withdraw("0");
      // reward = accRewardBalance * carolShare / PRECISION
      //        = accRewardBalance * 194e18 / 1e24
      //        = 1.999999999999999999e18
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.be.closeTo(
        ethers.utils.parseEther("2"),
        ethers.utils.parseEther("0.0001")
      );
    });

    it("should distribute token accordingly even if update isn't called every day", async () => {
      await this.dragonStaker.connect(this.alice).deposit(1);
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(
        0
      );

      await this.rewardToken
        .connect(this.rewardDistributor)
        .transfer(this.dragonStaker.address, ethers.utils.parseEther("1"));
      await this.dragonStaker.connect(this.alice).withdraw(0);

      await this.rewardToken
        .connect(this.rewardDistributor)
        .transfer(this.dragonStaker.address, ethers.utils.parseEther("1"));
      await this.dragonStaker.connect(this.alice).withdraw(0);
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("2")
      );
    });

    it("should allow deposits and withdraws of multiple users and distribute rewards accordingly even if someone enters or leaves", async () => {
      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));
      await this.dragonStaker
        .connect(this.carol)
        .deposit(ethers.utils.parseEther("100"));

      await this.rewardToken
        .connect(this.rewardDistributor)
        .transfer(this.dragonStaker.address, ethers.utils.parseEther("4"));

      // accRewardBalance = rewardBalance * PRECISION / totalStaked
      //                  = 4e18 * 1e24 / 97e18
      //                  = 0.020618556701030927835051e24
      // bobRewardDebt = accRewardBalance * bobShare / PRECISION
      //               = accRewardBalance * 194e18 / 1e24
      //               = 0.3999999999999999999e18
      await this.dragonStaker
        .connect(this.bob)
        .deposit(ethers.utils.parseEther("200")); // Bob enters

      await this.dragonStaker
        .connect(this.carol)
        .withdraw(ethers.utils.parseEther("97"));
      // reward = accRewardBalance * carolShare / PRECISION
      //        = accRewardBalance * 97e18 / 1e24
      //        = 1.999999999999999999e18
      expect(
        await this.rewardToken.balanceOf(this.carol.address)
      ).to.be.closeTo(
        ethers.utils.parseEther("2"),
        ethers.utils.parseEther("0.0001")
      );

      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100")); // Alice enters again to try to get more rewards
      await this.dragonStaker
        .connect(this.alice)
        .withdraw(ethers.utils.parseEther("194"));
      // She gets the same reward as Carol
      const aliceBalance = await this.rewardToken.balanceOf(this.alice.address);
      // aliceRewardDebt = accRewardBalance * aliceShare / PRECISION
      //        = accRewardBalance * 0 / PRECISION - 0
      //        = 0      (she withdraw everything, so her share is 0)
      // reward = accRewardBalance * aliceShare / PRECISION
      //        = accRewardBalance * 97e18 / 1e24
      //        = 1.999999999999999999e18
      expect(aliceBalance).to.be.closeTo(
        ethers.utils.parseEther("2"),
        ethers.utils.parseEther("0.0001")
      );

      await this.rewardToken
        .connect(this.rewardDistributor)
        .transfer(this.dragonStaker.address, ethers.utils.parseEther("4"));

      await this.dragonStaker.connect(this.bob).withdraw("0");
      // reward = accRewardBalance * bobShare / PRECISION - bobRewardDebt
      //        = accRewardBalance * 194e18 / 1e24 - 3.999999999999999999e18
      //        = 4e18
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.be.closeTo(
        ethers.utils.parseEther("4"),
        ethers.utils.parseEther("0.0001")
      );

      // Alice shouldn't receive any token of the last reward
      await this.dragonStaker.connect(this.alice).withdraw("0");
      // reward = accRewardBalance * aliceShare / PRECISION - aliceRewardDebt
      //        = accRewardBalance * 0 / PRECISION - 0
      //        = 0      (she withdraw everything, so her share is 0)
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(
        aliceBalance
      );
    });

    it("pending tokens function should return the same number of token that user actually receive", async () => {
      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("300"));
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("700")
      );
      expect(
        await this.dragon.balanceOf(this.dragonStaker.address)
      ).to.be.equal(ethers.utils.parseEther("300"));
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("291"));
      expect(
        await this.dragonStaker.fees()
      ).to.be.equal(ethers.utils.parseEther("9"));
      await this.rewardToken.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("100")
      ); // We send 100 Tokens to dragonStaker's address

      const pendingRewards = await this.dragonStaker.pendingRewards(
        this.alice.address,
        this.rewardToken.address
      );
      await this.dragonStaker.connect(this.alice).withdraw("0"); // Alice shouldn't receive any token of the last reward
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("700")
      );
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(
        pendingRewards
      );
      expect(
        await this.dragon.balanceOf(this.dragonStaker.address)
      ).to.be.equal(ethers.utils.parseEther("300"));
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("291"));
      expect(
        await this.dragonStaker.fees()
      ).to.be.equal(ethers.utils.parseEther("9"));
    });

    it("should allow rewards in Dragon and USDT", async () => {
      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("1000"));
      await this.dragonStaker
        .connect(this.bob)
        .deposit(ethers.utils.parseEther("1000"));
      await this.dragonStaker
        .connect(this.carol)
        .deposit(ethers.utils.parseEther("1000"));

      await this.rewardToken.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("3")
      );

      await this.dragonStaker.connect(this.alice).withdraw(0);
      // accRewardBalance = rewardBalance * PRECISION / totalStaked
      //                  = 3e18 * 1e24 / 291e18
      //                  = 0.001030927835051546391752e24
      // reward = accRewardBalance * aliceShare / PRECISION
      //        = accRewardBalance * 970e18 / 1e24
      //        = 0.999999999999999999e18
      // aliceRewardDebt = 0.999999999999999999e18
      const aliceRewardbalance = await this.rewardToken.balanceOf(
        this.alice.address
      );
      expect(aliceRewardbalance).to.be.closeTo(
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("0.0001")
      );
      // accRewardBalance = 0
      // reward = 0
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(0);

      await this.dragonStaker.addRewardToken(this.dragon.address);
      await this.dragon.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("6")
      );

      await this.dragonStaker
        .connect(this.bob)
        .connect(this.bob)
        .withdraw(0);
      // reward = accRewardBalance * bobShare / PRECISION
      //        = accRewardBalance * 970e18 / 1e24
      //        = 0.999999999999999999e18
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.be.closeTo(
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("0.0001")
      );
      // accRewardBalance = rewardBalance * PRECISION / totalStaked
      //                  = 6e18 * 1e24 / 291e18
      //                  = 0.002061855670103092783505e24
      // reward = accRewardBalance * aliceShare / PRECISION
      //        = accRewardBalance * 970e18 / 1e24
      //        = 1.999999999999999999e18
      expect(await this.dragon.balanceOf(this.bob.address)).to.be.closeTo(
        ethers.utils.parseEther("2"),
        ethers.utils.parseEther("0.0001")
      );

      await this.dragonStaker
        .connect(this.alice)
        .withdraw(ethers.utils.parseEther("0"));
      // reward = accRewardBalance * aliceShare / PRECISION - aliceRewardDebt
      //        = accRewardBalance * 970e18 / 1e24 - 0.999999999999999999e18
      //        = 0
      // so she has the same balance as previously
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(
        aliceRewardbalance
      );
      // reward = accRewardBalance * aliceShare / PRECISION
      //        = accRewardBalance * 970e18 / 1e24
      //        = 1.999999999999999999e18
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.closeTo(
        ethers.utils.parseEther("2"),
        ethers.utils.parseEther("0.0001")
      );
    });

    it("rewardDebt should be updated as expected, alice deposits before last reward is sent", async () => {
      let token1 = await this.tokenFactory.deploy("Test Token", "TT", 18);
      await this.dragonStaker.addRewardToken(token1.address);

      await this.dragonStaker.connect(this.alice).deposit(1);
      await this.dragonStaker.connect(this.bob).deposit(1);

      await token1.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("1")
      );
      await this.dragonStaker.connect(this.alice).withdraw(1);

      let balAlice = await token1.balanceOf(this.alice.address);
      let balBob = await token1.balanceOf(this.bob.address);
      expect(balAlice).to.be.equal(ethers.utils.parseEther("0.5"));
      expect(balBob).to.be.equal(0);

      await token1.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("1")
      );
      await this.dragonStaker.connect(this.bob).withdraw(0);
      await this.dragonStaker.connect(this.alice).deposit(1);

      balBob = await token1.balanceOf(this.bob.address);
      expect(await token1.balanceOf(this.alice.address)).to.be.equal(balAlice);
      expect(balBob).to.be.equal(ethers.utils.parseEther("1.5"));

      await token1.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("1")
      );
      await this.dragonStaker.connect(this.bob).withdraw(0);
      await this.dragonStaker.connect(this.alice).withdraw(0);

      balAlice = await token1.balanceOf(this.alice.address);
      balBob = await token1.balanceOf(this.bob.address);
      expect(await token1.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("1")
      );
      expect(balBob).to.be.equal(ethers.utils.parseEther("2"));

      await this.dragonStaker.removeRewardToken(token1.address);
    });

    it("rewardDebt should be updated as expected, alice deposits after last reward is sent", async () => {
      let token1 = await this.tokenFactory.deploy("Test Token", "TT", 18);
      await this.dragonStaker.addRewardToken(token1.address);

      await this.dragonStaker.connect(this.alice).deposit(1);
      await this.dragonStaker.connect(this.bob).deposit(1);

      await token1.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("1")
      );
      await this.dragonStaker.connect(this.alice).withdraw(1);

      let balAlice = await token1.balanceOf(this.alice.address);
      let balBob = await token1.balanceOf(this.bob.address);
      expect(balAlice).to.be.equal(ethers.utils.parseEther("0.5"));
      expect(balBob).to.be.equal(0);

      await token1.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("1")
      );
      await this.dragonStaker.connect(this.bob).withdraw(0);

      balBob = await token1.balanceOf(this.bob.address);
      expect(await token1.balanceOf(this.alice.address)).to.be.equal(balAlice);
      expect(balBob).to.be.equal(ethers.utils.parseEther("1.5"));

      await token1.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("1")
      );
      await this.dragonStaker.connect(this.alice).deposit(1);
      await this.dragonStaker.connect(this.bob).withdraw(0);
      await this.dragonStaker.connect(this.alice).withdraw(0);

      balAlice = await token1.balanceOf(this.alice.address);
      balBob = await token1.balanceOf(this.bob.address);
      expect(await token1.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("0.5")
      );
      expect(balBob).to.be.equal(ethers.utils.parseEther("2.5"));
    });

    it("should allow adding and removing a rewardToken, only by owner", async () => {
      let token1 = await this.tokenFactory.deploy("Test Token", "TT", 18);
      await expect(
        this.dragonStaker.connect(this.alice).addRewardToken(token1.address)
      ).to.be.revertedWith("OwnableUnauthorizedAccount");
      expect(
        await this.dragonStaker.isRewardToken(token1.address)
      ).to.be.equal(false);
      expect(await this.dragonStaker.rewardTokensCounter()).to.be.equal(1);

      await this.dragonStaker
        .connect(this.dev)
        .addRewardToken(token1.address);
      await expect(
        this.dragonStaker.connect(this.dev).addRewardToken(token1.address)
      ).to.be.revertedWith("AlreadyAdded");
      expect(
        await this.dragonStaker.isRewardToken(token1.address)
      ).to.be.equal(true);
      expect(await this.dragonStaker.rewardTokensCounter()).to.be.equal(2);

      await this.dragonStaker
        .connect(this.dev)
        .removeRewardToken(token1.address);
      expect(
        await this.dragonStaker.isRewardToken(token1.address)
      ).to.be.equal(false);
      expect(await this.dragonStaker.rewardTokensCounter()).to.be.equal(1);
    });

    it("should allow setting a new deposit fee, only by owner", async () => {
      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("900")
      );
      expect(
        await this.dragon.balanceOf(this.dragonStaker.address)
      ).to.be.equal(ethers.utils.parseEther("100"));
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("97"));
      expect(
        await this.dragonStaker.fees()
      ).to.be.equal(ethers.utils.parseEther("3"));
      expect(
        await this.dragon.balanceOf(this.treasury.address)
      ).to.be.equal(ethers.utils.parseEther("0"));

      await expect(
        this.dragonStaker.connect(this.alice).setDepositFeePercent("0")
      ).to.be.revertedWith("OwnableUnauthorizedAccount");
      await expect(
        this.dragonStaker
          .connect(this.dev)
          .setDepositFeePercent(2001)
      ).to.be.revertedWith(
        "InvalidValue"
      );

      await this.dragonStaker
        .connect(this.dev)
        .setDepositFeePercent(2000);
      expect(await this.dragonStaker.depositFeePercent()).to.be.equal(
        2000
      );

      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("800")
      );

      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(
        ethers.utils.parseEther("97").add(ethers.utils.parseEther("80"))
      );

      const accumulatedFees = ethers.utils.parseEther("3").add(ethers.utils.parseEther("20"));

      const dragonStakerBalance = await this.dragon.balanceOf(this.dragonStaker.address);

      expect(
        await this.dragonStaker.fees()
      ).to.be.equal(
        accumulatedFees
      );

      await this.dragonStaker.connect(this.dev).withdrawFees();

      expect(
        await this.dragonStaker.fees()
      ).to.be.equal(0);

      expect(
        await this.dragon.balanceOf(this.treasury.address)
      ).to.be.equal(accumulatedFees);

      expect(
        await this.dragon.balanceOf(this.dragonStaker.address)
      ).to.be.equal(dragonStakerBalance.sub(accumulatedFees));
    });

    it("should allow emergency withdraw", async () => {
      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("300"));
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("700")
      );
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("291"));

      await this.rewardToken.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("100")
      );

      await this.dragonStaker.connect(this.alice).emergencyWithdraw(); // Alice shouldn't receive any token of the last reward
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("991")
      );
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(
        0
      );
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(0);
      const userInfo = await this.dragonStaker.getUserInfo(
        this.dragonStaker.address,
        this.rewardToken.address
      );
      expect(userInfo[0]).to.be.equal(0);
      expect(userInfo[1]).to.be.equal(0);
    });

    it("should allow owner to sweep stuck tokens that are not rewards", async () => {
      await this.dragonStaker
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("300"));
      expect(await this.dragon.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("700")
      );
      expect(
        await this.dragonStaker.totalDeposits()
      ).to.be.equal(ethers.utils.parseEther("291"));

      const stuckToken = await this.tokenFactory.deploy("Test Token","TT", 18);
      await stuckToken.mint(
        this.dragonStaker.address,
        ethers.utils.parseEther("100")
      );

      await this.dragonStaker
        .connect(this.dev)
        .sweep(stuckToken.address, this.dev.address);

      expect(await stuckToken.balanceOf(this.dev.address)).to.be.equal(
        ethers.utils.parseEther("100")
      );
      expect(
        await stuckToken.balanceOf(this.dragonStaker.address)
      ).to.be.equal(0);

      // Should fail for dragon
      await expect(
        this.dragonStaker
          .connect(this.dev)
          .sweep(this.dragon.address, this.dev.address)
      ).to.be.revertedWith("InvalidValue");

      // Should fail if stuckToken is added as a reward token
      await this.dragonStaker
        .connect(this.dev)
        .addRewardToken(stuckToken.address);

      await expect(
        this.dragonStaker
          .connect(this.dev)
          .sweep(stuckToken.address, this.dev.address)
      ).to.be.revertedWith("InvalidValue");
    });
  });

  after(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
