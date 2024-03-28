const { ethers } = require('hardhat');
const { expect } = require('chai');
const {currentTimestamp, advanceTimeAndBlock} = require('./helpers');
const hre = require('hardhat');
const {parseUnits} = require("ethers/lib/utils");

describe('DragonswapStaker', () => {
    let stake1Token, stake2Token, rewardToken, rewardTokenDecimals;
    let rewardAmount, rewardAmountWei, rewardPerSecond, rewardPerSecondWei;
    let startTimestamp;
    let farm;
    let owner, alice, bob, carl, users;

    const MintAmount = ethers.utils.parseEther("1000000000");

    // Initialize users
    before(async () => {
        [owner, alice, bob, carl, ...users] = await ethers.getSigners();
    });

    //Initialize tokens
    before(async () => {
        const tokenFactory = await hre.ethers.getContractFactory('Token');

        stake1Token = await tokenFactory.connect(owner).deploy("Dragonswap1", "DLP1", 18);
        await stake1Token.deployed();
        await stake1Token.mint(owner.address, MintAmount);

        stake2Token = await tokenFactory.connect(owner).deploy("Dragonswap2", "DLP2", 18);
        await stake2Token.deployed();
        await stake2Token.mint(owner.address, MintAmount);

        rewardToken = await tokenFactory.connect(owner).deploy("RewardToken", "RWRD", 18);
        await rewardToken.deployed();
        await rewardToken.mint(owner.address, MintAmount);
    });

    // Initialize farm
    before(async () => {
        startTimestamp = await currentTimestamp() + 100;

        rewardTokenDecimals = await rewardToken.decimals();

        rewardAmount = 10000
        rewardAmountWei = parseUnits(rewardAmount.toString(), rewardTokenDecimals);
        rewardPerSecond = 100
        rewardPerSecondWei = parseUnits(rewardPerSecond.toString(), rewardTokenDecimals);

        const farmContractFactory = await hre.ethers.getContractFactory('DragonswapStakerFactory')
        const farmFactory = await farmContractFactory.deploy(owner.address)
        await farmFactory.deployed()

        const farmImplmentationFactory = await hre.ethers.getContractFactory('DragonswapStaker')
        const farmImplementation = await farmImplmentationFactory.deploy()
        await farmImplementation.deployed()

        await farmFactory.connect(owner).setImplementationClassic(farmImplementation.address);

        const farmCreationTx = await farmFactory.deployClassic(
            rewardToken.address,
            rewardPerSecondWei,
            startTimestamp
        )

        const farmTxReceipt = await farmCreationTx.wait()

        farm = await hre.ethers.getContractAt('DragonswapStaker', farmTxReceipt.logs[0].address)

        await farm.add(15, stake1Token.address, false)

        await rewardToken.connect(owner).approve(farm.address, rewardAmountWei)

        await farm.connect(owner).fund(rewardAmountWei)
    })

    // Initialize users balances
    before(async () => {
        await stake1Token.transfer(alice.address, 5000)
        await stake1Token.transfer(bob.address, 1000)
        await stake1Token.transfer(carl.address, 2000)

        await stake2Token.transfer(alice.address, 1000)
        await stake2Token.transfer(carl.address, 800)
    });

    describe('When created', function () {
        it('Should have correct reward token', async () => {
            expect(await farm.rewardToken()).eq(rewardToken.address);
        });

        it('Should have correct reward per second', async () => {
            expect(await farm.rewardPerSecond()).eq(rewardPerSecondWei);
        });

        it('Should have correct start and end timestamps', async () => {
            expect(await farm.startTimestamp()).eq(startTimestamp);
            expect(await farm.endTimestamp()).eq(startTimestamp + rewardAmount / rewardPerSecond);
        });

        it('Should have correct stake token', async () => {
            const poolLength = await farm.pools();
            expect(poolLength).eq(1);

            const poolInfo = await farm.poolInfo(0);
            expect(poolInfo[0]).eq(stake1Token.address);
            expect(poolInfo[1]).eq(15);

            const totalAllocPoint = await farm.totalAllocPoint();
            expect(totalAllocPoint).eq(15);
        });

        it('Should have correct total rewards', async () => {
            expect(await farm.totalRewards()).eq(rewardAmountWei);
        });
    });

    describe('Before the start', function () {
        before(async () => {
            await stake1Token.connect(alice).approve(farm.address, 1500)
            await farm.connect(alice).deposit(0, 1500);

            await stake1Token.connect(bob).approve(farm.address, 500)
            await farm.connect(bob).deposit(0, 500);
        });

        it('Allows participants to join', async() => {
            const balanceFarm = await stake1Token.balanceOf(farm.address);
            expect(balanceFarm).eq(2000);

            const balanceAlice = await stake1Token.balanceOf(alice.address);
            const depositedAlice = await farm.deposited(0, alice.address);
            expect(balanceAlice).eq(3500);
            expect(depositedAlice).eq(1500);

            const balanceBob = await stake1Token.balanceOf(bob.address);
            const depositedBob = await farm.deposited(0, bob.address);
            expect(balanceBob).eq(500);
            expect(depositedBob).eq(500);
        });

        it('Does not assign any rewards yet', async () =>{
            const totalPending = await farm.totalPending();
            expect(totalPending).eq(0);
        });
    });

    describe('After 10 seconds of farming', function () {
        const secondsOfFarming = 10;
        before(async () => {
            await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + secondsOfFarming);
        });

        it('Has a total of 1000 rewardTokens', async () => {
            const totalPending = await farm.totalPending();
            expect(totalPending).eq(parseUnits((rewardAmount / secondsOfFarming).toString(), rewardTokenDecimals));

            const pendingAlice = await farm.pending(0, alice.address);
            expect(pendingAlice).eq(parseUnits("750", rewardTokenDecimals));

            const pendingBob = await farm.pending(0, bob.address);
            expect(pendingBob).eq(parseUnits("250", rewardTokenDecimals));
        });


        describe('With a 3th participant after 30 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 28);

                await stake1Token.connect(carl).approve(farm.address, 2000)
                await farm.connect(carl).deposit(0, 2000);

                const balanceCarl = await stake1Token.balanceOf(carl.address);
                const depositedCarl = await farm.deposited(0, carl.address);
                expect(balanceCarl).eq(0);
                expect(depositedCarl).eq(2000);
            });

            it('Has a total of 3000 rewardTokens', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("3000", rewardTokenDecimals));
            });

            it('Has correct pending rewards for all participants', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(parseUnits("2250", rewardTokenDecimals));

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("750", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("0", rewardTokenDecimals));
            });
        });

        describe('After 50 seconds of farming', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 50);
            });

            it('Has a total of 5000 rewardTokens', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("5000", rewardTokenDecimals));
            });

            it('Has correct pending rewards for all participants', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(parseUnits("3000", rewardTokenDecimals));

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("1000", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("1000", rewardTokenDecimals));
            });
        });

        describe('With a participant withdrawing after 70 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 69);

                await farm.connect(alice).withdraw(0, 1500);
            });

            it('Gives alice 3750 rewardToken and 1500 staked tokens', async () => {
                const balanceAliceStakeToken = await stake1Token.balanceOf(alice.address);
                expect(balanceAliceStakeToken).eq(5000);

                const balanceAliceReward = await rewardToken.balanceOf(alice.address);
                expect(balanceAliceReward).eq(parseUnits("3750", rewardTokenDecimals));
            });

            it('Has no deposit for alice', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);
            });

            it('Has a total of 3250 rewardTokens and 6500 boosterTokens', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("3250", rewardTokenDecimals));
            });

            it('Has no rewards for alice and has correct pending rewards for all participants', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("1250", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("2000", rewardTokenDecimals));
            });
        });

        describe('With a participant partially withdrawing after 80 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 79);

                await farm.connect(carl).withdraw(0, 1500);
            });

            it('Gives carl 2800 rewardTokens and 1500 staked tokens', async () => {
                const balanceCarlLP = await stake1Token.balanceOf(carl.address);
                expect(balanceCarlLP).eq(1500);

                const balanceCarlReward = await rewardToken.balanceOf(carl.address);
                expect(balanceCarlReward).eq(parseUnits("2800", rewardTokenDecimals));
            });

            it('Has 500 staked tokens for carl', async () => {
                const depositedCarl = await farm.deposited(0, carl.address);
                expect(depositedCarl).eq(500);
            });

            it('Has a total reward of 1450 rewardTokens ', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("1450", rewardTokenDecimals));
            });

            it('Reserved nothing for alice, 1450 rewardTokens for bob and nothing for carl', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("1450", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(0);
            });
        });

        describe('Is safe', function () {
            it('Won\'t allow alice to withdraw', async () => {
                await expect(farm.connect(alice).withdraw(0, 1500)).to.be.revertedWith('UnauthorizedWithdrawal');
            });

            it('Won\'t allow carl to withdraw more than his deposit', async () => {
                const deposited = await farm.deposited(0, carl.address);
                expect(deposited).eq(500);
                await expect(farm.connect(carl).withdraw(0, 1500)).to.be.revertedWith('UnauthorizedWithdrawal');
            });
        });

        describe('When it receives more funds(8000 rewardTokens)', function () {
            before(async () => {
                await rewardToken.approve(farm.address, parseUnits("8000", rewardTokenDecimals));
                await farm.fund(parseUnits("8000", rewardTokenDecimals));
            })

            it('Runs for 180 seconds(80 more)', async () => {
                const endTimestamp = await farm.endTimestamp();
                expect(endTimestamp - startTimestamp).eq(180);
            });
        });

        describe('With an additional stake token (for 25%) after 100 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 99);

                await farm.add(5, stake2Token.address, true);
            });

            it('Has a total of 3450 rewardTokens', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("3450", rewardTokenDecimals));
            })

            it('Is initialized for the LP token 2', async () => {
                const poolLength = await farm.pools();
                expect(poolLength).eq(2);

                const poolInfo = await farm.poolInfo(1);
                expect(poolInfo[0]).eq(stake2Token.address);
                expect(poolInfo[1]).eq(5);

                const totalAllocPoint = await farm.totalAllocPoint();
                expect(totalAllocPoint).eq(20);
            });

            it('reserved nothing for alice, 2450 rewardTokens for bob and 1000 rewardTokens for carl', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("2450", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("1000", rewardTokenDecimals));
            });

        });

        describe('With a first participant using second token to stake after 110 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 108);
                await stake2Token.connect(carl).approve(farm.address, 500)
                await farm.connect(carl).deposit(1, 500);
            });

            it('Holds 1000 second stake tokens for participants', async () => {
                const balanceFarmLp = await stake1Token.balanceOf(farm.address);
                expect(balanceFarmLp).eq(1000);

                const depositAlice = await farm.deposited(0, alice.address);
                expect(depositAlice).eq(0);

                const depositBob = await farm.deposited(0, bob.address);
                expect(depositBob).eq(500);

                const depositCarl = await farm.deposited(0, carl.address);
                expect(depositCarl).eq(500);
            });

            it('Hold 500 second stake tokens for participants', async () => {
                const balanceFarmLp2 = await stake2Token.balanceOf(farm.address);
                expect(balanceFarmLp2).eq(500);

                const depositAlice = await farm.deposited(1, alice.address);
                expect(depositAlice).eq(0);

                const depositBob = await farm.deposited(1, bob.address);
                expect(depositBob).eq(0);

                const depositCarl = await farm.deposited(1, carl.address);
                expect(depositCarl).eq(500);
            });

            it('Has a total of 4450 rewardTokens', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("4450", rewardTokenDecimals));
            });

            it('Reserved 75% for LP (50/50 bob/carl)', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("2825", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("1375", rewardTokenDecimals));
            });

            it('Reserved 25% for LP2 (not rewarded) -> 250 rewardTokens and 500 boosterTokens inaccessible', async () => {
                const pendingAlice = await farm.pending(1, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(1, bob.address);
                expect(pendingBob).eq(0);

                const pendingCarl = await farm.pending(1, carl.address);
                expect(pendingCarl).eq(0);
            });
        });

        describe('With second participant for lp2 after 120 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 118);

                await stake2Token.connect(alice).approve(farm.address, 1000);
                await farm.connect(alice).deposit(1, 1000);
            });

            it('Holds 1500 LP2 for participants', async () => {
                const balanceFarmLp2 = await stake2Token.balanceOf(farm.address);
                expect(balanceFarmLp2).eq(1500);

                const depositAlice = await farm.deposited(1, alice.address);
                expect(depositAlice).eq(1000);

                const depositBob = await farm.deposited(1, bob.address);
                expect(depositBob).eq(0);

                const depositCarl = await farm.deposited(1, carl.address);
                expect(depositCarl).eq(500);
            });

            it('Has a total reward of 5450 rewardTokens', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("5450", rewardTokenDecimals));
            });

            it('Reserved 75% for LP with 3200 rewardTokens for bob, 1750 rewardTokens for carl', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("3200", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("1750", rewardTokenDecimals));

            });

            it('Reserved 25% for LP2 with 250 rewardTokens for carl', async () => {
                const pendingAlice = await farm.pending(1, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(1, bob.address);
                expect(pendingBob).eq(0);

                const pendingCarl = await farm.pending(1, carl.address);
                expect(pendingCarl).eq(parseUnits("250", rewardTokenDecimals));
            });
        });

        describe('After 140 seconds of farming', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 140);
            });

            it('Has a total reward of 7450 rewardTokens', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("7450", rewardTokenDecimals));
            });

            it('Reserved 75% for LP with 3950 rewardTokens for bob, 2500 rewardTokens for carl', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("3950", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("2500", rewardTokenDecimals));
            });

            // it('Reserved 25% for LP2 with 333 rewardTokens and 666 boosterTokens for alice, 416 rewardTokens and 832 boosterTokens for carl ', async () => {
            //     const pendingAlice = await boostedFarm.pending(1, alice.address);
            //      expect(pendingAlice).eq(parseUnits("333", rewardTokenDecimals));
            //      expect(pendingAlice[1]).eq(parseUnits("666", boosterTokenDecimals));
            //
            //      const pendingBob = await boostedFarm.pending(1, bob.address);
            //      expect(pendingBob).eq(0);
            //      expect(pendingBob[1]).eq(0);
            //
            //      const pendingCarl = await boostedFarm.pending(1, carl.address);
            //      expect(pendingCarl).eq(parseUnits("416", rewardTokenDecimals));
            //      expect(pendingCarl[1]).eq(parseUnits("832", boosterTokenDecimals));
            // });
        });

        describe('With a participant partially withdrawing LP2 after 150 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 149);
                await farm.connect(carl).withdraw(1, 200);
            });

            it('Gives carl 500 rewardTokens and 200 LP2', async () => {
                const balanceReward = await rewardToken.balanceOf(carl.address);
                expect(balanceReward).eq(parseUnits("3300", rewardTokenDecimals));

                const balanceLP2 = await stake2Token.balanceOf(carl.address);
                expect(balanceLP2).eq(500);
            });

            it('Has a total reward of 7950 rewardTokens', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("7950", rewardTokenDecimals));
            });

            it('Reserved 75% for LP with 4325 rewardTokens for bob, 2875 rewardTokens for carl', async () => {
                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("4325", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("2875", rewardTokenDecimals));
            });

            it('Reserved 25% for LP2 with 500 rewardTokens for alice and nothing for carl', async () => {
                const pendingAlice = await farm.pending(1, alice.address);
                expect(pendingAlice).eq(parseUnits("500", rewardTokenDecimals));

                const pendingCarl = await farm.pending(1, carl.address);
                expect(pendingCarl).eq(0);
            });

            it('Holds 1000 LP for participants', async () => {
                const balanceFarmLp = await stake1Token.balanceOf(farm.address);
                expect(balanceFarmLp).eq(1000);

                const depositBob = await farm.deposited(0, bob.address);
                expect(depositBob).eq(500);

                const depositCarl = await farm.deposited(0, carl.address);
                expect(depositCarl).eq(500);
            });

            it('Hold 1300 LP2 for participants', async () => {
                const balanceFarmLp2 = await stake2Token.balanceOf(farm.address);
                expect(balanceFarmLp2).eq(1300);

                const depositAlice = await farm.deposited(1, alice.address);
                expect(depositAlice).eq(1000);

                const depositCarl = await farm.deposited(1, carl.address);
                expect(depositCarl).eq(300);
            });
        });

        describe('With a participant doing an emergency withdraw LP2 after 160 seconds', function () {
            before (async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 159);
                await farm.connect(carl).emergencyWithdraw(1);
            });

            it('Gives carl 500 LP', async () => {
                const balanceLP2 = await stake2Token.balanceOf(carl.address);
                expect(balanceLP2).eq(800);
            });

            it('Gives carl no rewardTokens', async () => {
                const balanceReward = await rewardToken.balanceOf(carl.address);
                expect(balanceReward).eq(parseUnits("3300", rewardTokenDecimals));
            });

            it('Holds no LP2 for carl', async () => {
                const depositCarl  = await farm.deposited(1, carl.address);
                expect(depositCarl).eq(0);
            });

            it('Has no rewardTokens reserved for carl', async () => {
                const pendingCarl = await farm.pending(1, carl.address);
                expect(pendingCarl).eq(0);
            });

            it('Holds 1000 LP2 for alice', async () => {
                const balanceFarm = await stake2Token.balanceOf(farm.address);
                expect(balanceFarm).eq(1000);

                const depositAlice = await farm.deposited(1, alice.address);
                expect(depositAlice).eq(1000);
            });

            it('Has 750 rewardTokens reserved for alice(receives bobs share)', async () => {
                const pendingAlice = await farm.pending(1, alice.address);
                expect(pendingAlice).eq(parseUnits("750", rewardTokenDecimals));
            });
        });

        describe('When closed after 180 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 180);
            });

            it('Has a total reward of 10950 rewardTokens pending', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("10950", rewardTokenDecimals));
            });

            it('Reserved 75% for LP with 5450 rewardTokens and 10900 boosterTokens for bob, 4000 rewardTokens and 8000 boosterTokens for carl', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("5450", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("4000", rewardTokenDecimals));
            });

            it('Reserved 25% for LP2 with 1250 for alice', async () => {
                const pendingAlice = await farm.pending(1, alice.address);
                expect(pendingAlice).eq(parseUnits("1250", rewardTokenDecimals));

                const pendingBob = await farm.pending(1, bob.address);
                expect(pendingBob).eq(0);

                const pendingCarl = await farm.pending(1, carl.address);
                expect(pendingCarl).eq(0);

            });
        });

        describe('When closed for 20 seconds (after 200 seconds)', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 180);
            });

            it('Still has a total reward of 10950 rewardTokens pending', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("10950", rewardTokenDecimals));
            });

            it('Has a pending reward for LP of 5450 rewardTokens for bob, 4000 rewardTokens for carl', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(parseUnits("5450", rewardTokenDecimals));

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(parseUnits("4000", rewardTokenDecimals));
            });

            it('Has a pending 1250 rewardTokens for LP2 for alice', async () => {
                const pendingAlice = await farm.pending(1, alice.address);
                expect(pendingAlice).eq(parseUnits("1250", rewardTokenDecimals));

                const pendingBob = await farm.pending(1, bob.address);
                expect(pendingBob).eq(0);

                const pendingCarl = await farm.pending(1, carl.address);
                expect(pendingCarl).eq(0);
            });

            it('Will not accept new funds', async () => {
                await expect(farm.fund(parseUnits("1000", rewardTokenDecimals))).to.be.revertedWith('FarmClosed');
            });

        });

        describe('With participants withdrawing after closed', function () {
            before(async () => {
                await farm.connect(alice).withdraw(1, 1000);
                await farm.connect(bob).withdraw(0, 500);
                await farm.connect(carl).withdraw(0, 500);
            });

            it('Gives alice 1250 rewardTokens and 1000 LP2', async () => {
                const balanceAliceReward = await rewardToken.balanceOf(alice.address);
                expect(balanceAliceReward).eq(parseUnits("5000", rewardTokenDecimals));

                const balanceAliceStakeToken = await stake1Token.balanceOf(alice.address);
                expect(balanceAliceStakeToken).eq(5000);

                const balanceAliceStakeToken2 = await stake2Token.balanceOf(alice.address);
                expect(balanceAliceStakeToken2).eq(1000);
            });

            it('Gives carl 5450 rewardTokens and 500 LP', async () => {
                const balanceCarlReward = await rewardToken.balanceOf(carl.address);
                expect(balanceCarlReward).eq(parseUnits("7300", rewardTokenDecimals));

                const balanceCarlLP = await stake1Token.balanceOf(carl.address);
                expect(balanceCarlLP).eq(2000);

                const balanceCarlLP2 = await stake2Token.balanceOf(carl.address);
                expect(balanceCarlLP2).eq(800);

            });

            it('Has an end balance of 250 rewardTokens which is lost forever', async () => {
                const totalPending = await farm.totalPending();
                expect(totalPending).eq(parseUnits("250", rewardTokenDecimals));

                const balanceFarmReward = await rewardToken.balanceOf(farm.address);
                expect(balanceFarmReward).eq(parseUnits("250", rewardTokenDecimals));
            });

            it('Has no pending rewardTokens for all participants for LP', async () => {
                const pendingAlice = await farm.pending(0, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(0, bob.address);
                expect(pendingBob).eq(0);

                const pendingCarl = await farm.pending(0, carl.address);
                expect(pendingCarl).eq(0);
            });

            it('Has no pending rewardTokens for all participants for LP2', async () => {
                const pendingAlice = await farm.pending(1, alice.address);
                expect(pendingAlice).eq(0);

                const pendingBob = await farm.pending(1, bob.address);
                expect(pendingBob).eq(0);

                const pendingCarl = await farm.pending(1, carl.address);
                expect(pendingCarl).eq(0);
            });
        });
    });

});
