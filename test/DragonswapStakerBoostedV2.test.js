const { ethers } = require('hardhat');
const { expect } = require('chai');
const {currentTimestamp, advanceTimeAndBlock} = require('./helpers');
const hre = require('hardhat');
const {parseUnits} = require("ethers/lib/utils");

describe('DragonswapStakerBoosted', () => {
    let stake1Token, stake2Token, rewardToken, rewardTokenDecimals,  boosterToken, boosterTokenDecimals;
    let rewardAmount, rewardAmountWei, boosterAmount, boosterAmountWei, rewardPerSecond, rewardPerSecondWei;
    let startTimestamp;
    let boostedFarm;
    let owner, alice, bob, carl, users;

    // Initialize users
    before(async () => {
        [owner, alice, bob, carl, ...users] = await ethers.getSigners();
    });

    //Initialize tokens
    before(async () => {
        const tokenFactory = await hre.ethers.getContractFactory('Token');

        stake1Token = await tokenFactory.connect(owner).deploy("Dragonswap1", "DLP1", 18)
        await stake1Token.deployed()

        stake2Token = await tokenFactory.connect(owner).deploy("Dragonswap2", "DLP2", 18)
        await stake2Token.deployed()

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

        const boostedFarmContractFactory = await hre.ethers.getContractFactory('DragonswapStakerFactory')
        const boostedFarmFactory = await boostedFarmContractFactory.deploy(owner.address)
        await boostedFarmFactory.deployed()

        const boostedFarmImplmentationFactory = await hre.ethers.getContractFactory('DragonswapStakerBoosted')
        const boostedFarmImplementation = await boostedFarmImplmentationFactory.deploy()
        await boostedFarmImplementation.deployed()

        await boostedFarmFactory.connect(owner).setImplementationBoosted(boostedFarmImplementation.address);

        const boostedFarmCreationTx = await boostedFarmFactory.deployBoosted(
            rewardToken.address,
            boosterToken.address,
            rewardPerSecondWei,
            startTimestamp
        )

        const boostedFarmTxReceipt = await boostedFarmCreationTx.wait()

        boostedFarm = await hre.ethers.getContractAt('DragonswapStakerBoosted', boostedFarmTxReceipt.logs[0].address)

        await boostedFarm.add(15, stake1Token.address, false)

        await rewardToken.connect(owner).approve(boostedFarm.address, rewardAmountWei)
        await boosterToken.connect(owner).approve(boostedFarm.address, boosterAmountWei)

        await boostedFarm.connect(owner).fund(rewardAmountWei, boosterAmountWei)
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
            expect(poolInfo[0]).eq(stake1Token.address);
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
            await stake1Token.connect(alice).approve(boostedFarm.address, 1500)
            await boostedFarm.connect(alice).deposit(0, 1500);

            await stake1Token.connect(bob).approve(boostedFarm.address, 500)
            await boostedFarm.connect(bob).deposit(0, 500);
        });

        it('Allows participants to join', async() => {
            const balanceFarm = await stake1Token.balanceOf(boostedFarm.address);
            expect(balanceFarm).eq(2000);

            const balanceAlice = await stake1Token.balanceOf(alice.address);
            const depositedAlice = await boostedFarm.deposited(0, alice.address);
            expect(balanceAlice).eq(3500);
            expect(depositedAlice).eq(1500);

            const balanceBob = await stake1Token.balanceOf(bob.address);
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
        const secondsOfFarming = 10;
        before(async () => {
            await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + secondsOfFarming);
        });

        it('Has a total of 1000 rewardTokens and 2000 boosterTokens', async () => {
            const totalPending = await boostedFarm.totalPending();
            const totalPendingReward = totalPending[0];
            const totalPendingBooster = totalPending[1];
            expect(totalPendingReward).eq(parseUnits((rewardAmount / secondsOfFarming).toString(), rewardTokenDecimals));
            expect(totalPendingBooster).eq(parseUnits((boosterAmount / secondsOfFarming).toString(), boosterTokenDecimals));

            const pendingAlice = await boostedFarm.pending(0, alice.address);
            expect(pendingAlice[0]).eq(parseUnits("750", rewardTokenDecimals));
            expect(pendingAlice[1]).eq(parseUnits("1500", boosterTokenDecimals));

            const pendingBob = await boostedFarm.pending(0, bob.address);
            expect(pendingBob[0]).eq(parseUnits("250", rewardTokenDecimals));
            expect(pendingBob[1]).eq(parseUnits("500", boosterTokenDecimals));
        });


        describe('With a 3th participant after 30 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 28);

                await stake1Token.connect(carl).approve(boostedFarm.address, 2000)
                await boostedFarm.connect(carl).deposit(0, 2000);

                const balanceCarl = await stake1Token.balanceOf(carl.address);
                const depositedCarl = await boostedFarm.deposited(0, carl.address);
                expect(balanceCarl).eq(0);
                expect(depositedCarl).eq(2000);
            });

            it('Has a total of 3000 rewardTokens and 6000 boosterTokens', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("3000", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("6000", boosterTokenDecimals));
            });

            it('Has correct pending rewards for all participants', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(parseUnits("2250", rewardTokenDecimals));
                expect(pendingAlice[1]).eq(parseUnits("4500", boosterTokenDecimals));

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("750", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("1500", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("0", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("0", boosterTokenDecimals));
            });
        });

        describe('After 50 seconds of farming', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 50);
            });

            it('Has a total of 5000 rewardTokens and 10000 boosterTokens', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("5000", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("10000", boosterTokenDecimals));
            });

            it('Has correct pending rewards for all participants', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(parseUnits("3000", rewardTokenDecimals));
                expect(pendingAlice[1]).eq(parseUnits("6000", boosterTokenDecimals));

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("1000", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("2000", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("1000", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("2000", boosterTokenDecimals));
            });
        });

        describe('With a participant withdrawing after 70 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 69);

                await boostedFarm.connect(alice).withdraw(0, 1500);
            });

            it('Gives alice 3750 rewardToken, 7500 boosterToken and 1500 LP', async () => {
                const balanceAliceLP = await stake1Token.balanceOf(alice.address);
                expect(balanceAliceLP).eq(5000);

                const balanceAliceReward = await rewardToken.balanceOf(alice.address);
                expect(balanceAliceReward).eq(parseUnits("3750", rewardTokenDecimals));

                const balanceAliceBooster = await boosterToken.balanceOf(alice.address);
                expect(balanceAliceBooster).eq(parseUnits("7500", boosterTokenDecimals));
            });

            it('Has no deposit for alice', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);
            });

            it('Has a total of 3250 rewardTokens and 6500 boosterTokens', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("3250", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("6500", boosterTokenDecimals));
            });

            it('Has no rewards for alice and has correct pending rewards for all participants', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("1250", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("2500", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("2000", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("4000", boosterTokenDecimals));
            });
        });

        describe('With a participant partially withdrawing after 80 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 79);

                await boostedFarm.connect(carl).withdraw(0, 1500);
            });

            it('Gives carl 2800 rewardTokens, 5600 boosterTokens and 1500 LP', async () => {
                const balanceCarlLP = await stake1Token.balanceOf(carl.address);
                expect(balanceCarlLP).eq(1500);

                const balanceCarlReward = await rewardToken.balanceOf(carl.address);
                expect(balanceCarlReward).eq(parseUnits("2800", rewardTokenDecimals));

                const balanceCarlBooster = await boosterToken.balanceOf(carl.address);
                expect(balanceCarlBooster).eq(parseUnits("5600", boosterTokenDecimals));
            });

            it('Has 500 LP for carl', async () => {
                const depositedCarl = await boostedFarm.deposited(0, carl.address);
                console.log("depositedCarl", depositedCarl)
                expect(depositedCarl).eq(500);
            });

            it('Has a total reward of 1450 rewardTokens and 2900 boosterTokens', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("1450", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("2900", boosterTokenDecimals));
            });

            it('Reserved nothing for alice, 1450 rewardTokens and 2900 boosterTokens for bob and nothing for carl', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("1450", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("2900", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(0);
                expect(pendingCarl[1]).eq(0);
            });
        });

        describe('Is safe', function () {
            it('Won\'t allow alice to withdraw', async () => {
                await expect(boostedFarm.connect(alice).withdraw(0, 1500)).to.be.revertedWith('UnauthorizedWithdrawal');
            });

            it('Won\'t allow carl to withdraw more than his deposit', async () => {
                const deposited = await boostedFarm.deposited(0, carl.address);
                expect(deposited).eq(500);
                await expect(boostedFarm.connect(carl).withdraw(0, 1500)).to.be.revertedWith('UnauthorizedWithdrawal');
            });
        });

        describe('When it receives more funds(8000 rewardTokens and 16000 boosterTokens)', function () {
            before(async () => {
                await rewardToken.approve(boostedFarm.address, parseUnits("8000", rewardTokenDecimals));
                await boosterToken.approve(boostedFarm.address, parseUnits("16000", boosterTokenDecimals));
                await boostedFarm.fund(parseUnits("8000", rewardTokenDecimals), parseUnits("16000", boosterTokenDecimals));
            })

            it('Runs for 180 seconds(80 more)', async () => {
                const endTimestamp = await boostedFarm.endTimestamp();
                expect(endTimestamp - startTimestamp).eq(180);
            });
        });

        describe('With an added lp token (for 25%) after 100 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 99);

                await boostedFarm.add(5, stake2Token.address, true);
            });

            it('Has a total of 3450 rewardTokens and 8900 boosterTokens', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("3450", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("6900", boosterTokenDecimals));
            })

            it('Is initialized for the LP token 2', async () => {
                const poolLength = await boostedFarm.pools();
                expect(poolLength).eq(2);

                const poolInfo = await boostedFarm.poolInfo(1);
                expect(poolInfo[0]).eq(stake2Token.address);
                expect(poolInfo[1]).eq(5);

                const totalAllocPoint = await boostedFarm.totalAllocPoint();
                expect(totalAllocPoint).eq(20);
            });

            it('reserved nothing for alice, 2450 rewardTokens and 4900 boosterTokens for bob, 1000 rewardTokens and 2000 boosterTokens for carl', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("2450", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("4900", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("1000", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("2000", boosterTokenDecimals));
            });

        });

        describe('With a first participant for lp2 after 110 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 108);
                await stake2Token.connect(carl).approve(boostedFarm.address, 500)
                await boostedFarm.connect(carl).deposit(1, 500);
            });

            it('Holds 1000 LP tokens for participants', async () => {
                const balanceFarmLp = await stake1Token.balanceOf(boostedFarm.address);
                expect(balanceFarmLp).eq(1000);

                const depositAlice = await boostedFarm.deposited(0, alice.address);
                expect(depositAlice).eq(0);

                const depositBob = await boostedFarm.deposited(0, bob.address);
                expect(depositBob).eq(500);

                const depositCarl = await boostedFarm.deposited(0, carl.address);
                expect(depositCarl).eq(500);
            });

            it('Hold 500 LP2 for participants', async () => {
                const balanceFarmLp2 = await stake2Token.balanceOf(boostedFarm.address);
                expect(balanceFarmLp2).eq(500);

                const depositAlice = await boostedFarm.deposited(1, alice.address);
                expect(depositAlice).eq(0);

                const depositBob = await boostedFarm.deposited(1, bob.address);
                expect(depositBob).eq(0);

                const depositCarl = await boostedFarm.deposited(1, carl.address);
                expect(depositCarl).eq(500);
            });

            it('Has a total of 4450 rewardTokens and 8900 boosterTokens', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("4450", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("8900", boosterTokenDecimals));
            });

            it('Reserved 75% for LP (50/50 bob/carl)', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("2825", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("5650", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("1375", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("2750", boosterTokenDecimals));
            });

            it('Reserved 25% for LP2 (not rewarded) -> 250 rewardTokens and 500 boosterTokens inaccessible', async () => {
                const pendingAlice = await boostedFarm.pending(1, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);

                const pendingBob = await boostedFarm.pending(1, bob.address);
                expect(pendingBob[0]).eq(0);
                expect(pendingBob[1]).eq(0);

                const pendingCarl = await boostedFarm.pending(1, carl.address);
                expect(pendingCarl[0]).eq(0);
                expect(pendingCarl[1]).eq(0);
            });
        });

        describe('With second participant for lp2 after 120 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 118);

                await stake2Token.connect(alice).approve(boostedFarm.address, 1000);
                await boostedFarm.connect(alice).deposit(1, 1000);
            });

            it('Holds 1500 LP2 for participants', async () => {
                const balanceFarmLp2 = await stake2Token.balanceOf(boostedFarm.address);
                expect(balanceFarmLp2).eq(1500);

                const depositAlice = await boostedFarm.deposited(1, alice.address);
                expect(depositAlice).eq(1000);

                const depositBob = await boostedFarm.deposited(1, bob.address);
                expect(depositBob).eq(0);

                const depositCarl = await boostedFarm.deposited(1, carl.address);
                expect(depositCarl).eq(500);
            });

            it('Has a total reward of 5450 rewardTokens and 10900 boosterTokens', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("5450", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("10900", boosterTokenDecimals));
            });

            it('Reserved 75% for LP with 3200 rewardTokens and 6400 boosterTokens for bob, 1750 rewardTokens and 3500 boosterTokens for carl', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("3200", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("6400", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("1750", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("3500", boosterTokenDecimals));

            });

            it('Reserved 25% for LP2 with 250 rewardTokens and 500 boosterTokens for carl', async () => {
                const pendingAlice = await boostedFarm.pending(1, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);

                const pendingBob = await boostedFarm.pending(1, bob.address);
                expect(pendingBob[0]).eq(0);
                expect(pendingBob[1]).eq(0);

                const pendingCarl = await boostedFarm.pending(1, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("250", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("500", boosterTokenDecimals));
            });
        });

        describe('After 140 seconds of farming', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 140);
            });

            it('Has a total reward of 7450 rewardTokens and 14900 boosterTokens', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("7450", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("14900", boosterTokenDecimals));
            });

            it('Reserved 75% for LP with 3950 rewardTokens and 7900 boosterTokens for bob, 2500 rewardTokens and 5000 boosterTokens for carl', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("3950", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("7900", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("2500", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("5000", boosterTokenDecimals));
            });

            // it('Reserved 25% for LP2 with 333 rewardTokens and 666 boosterTokens for alice, 416 rewardTokens and 832 boosterTokens for carl ', async () => {
            //     const pendingAlice = await boostedFarm.pending(1, alice.address);
            //      expect(pendingAlice[0]).eq(parseUnits("333", rewardTokenDecimals));
            //      expect(pendingAlice[1]).eq(parseUnits("666", boosterTokenDecimals));
            //
            //      const pendingBob = await boostedFarm.pending(1, bob.address);
            //      expect(pendingBob[0]).eq(0);
            //      expect(pendingBob[1]).eq(0);
            //
            //      const pendingCarl = await boostedFarm.pending(1, carl.address);
            //      expect(pendingCarl[0]).eq(parseUnits("416", rewardTokenDecimals));
            //      expect(pendingCarl[1]).eq(parseUnits("832", boosterTokenDecimals));
            // });
        });

        describe('With a participant partially withdrawing LP2 after 150 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 149);
                await boostedFarm.connect(carl).withdraw(1, 200);
            });

            it('Gives carl 500 rewardTokens, 1000 boosterTokens and 200 LP2', async () => {
                const balanceReward = await rewardToken.balanceOf(carl.address);
                expect(balanceReward).eq(parseUnits("3300", rewardTokenDecimals));

                const balanceBooster = await boosterToken.balanceOf(carl.address);
                expect(balanceBooster).eq(parseUnits("6600", boosterTokenDecimals));

                const balanceLP2 = await stake2Token.balanceOf(carl.address);
                expect(balanceLP2).eq(500);
            });

            it('Has a total reward of 7950 rewardTokens and 15900 boosterTokens', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("7950", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("15900", boosterTokenDecimals));
            });

            it('Reserved 75% for LP with 4325 rewardTokens and 8650 boosterTokens for bob, 2875 rewardTokens and 5750 boosterTokens for carl', async () => {
                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("4325", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("8650", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("2875", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("5750", boosterTokenDecimals));
            });

            it('Reserved 25% for LP2 with 500 rewardTokens and 1000 boosterTokens for alice and nothing for carl', async () => {
                const pendingAlice = await boostedFarm.pending(1, alice.address);
                expect(pendingAlice[0]).eq(parseUnits("500", rewardTokenDecimals));
                expect(pendingAlice[1]).eq(parseUnits("1000", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(1, carl.address);
                expect(pendingCarl[0]).eq(0);
            });

            it('Holds 1000 LP for participants', async () => {
                const balanceFarmLp = await stake1Token.balanceOf(boostedFarm.address);
                expect(balanceFarmLp).eq(1000);

                const depositBob = await boostedFarm.deposited(0, bob.address);
                expect(depositBob).eq(500);

                const depositCarl = await boostedFarm.deposited(0, carl.address);
                expect(depositCarl).eq(500);
            });

            it('Hold 1300 LP2 for participants', async () => {
                const balanceFarmLp2 = await stake2Token.balanceOf(boostedFarm.address);
                expect(balanceFarmLp2).eq(1300);

                const depositAlice = await boostedFarm.deposited(1, alice.address);
                expect(depositAlice).eq(1000);

                const depositCarl = await boostedFarm.deposited(1, carl.address);
                expect(depositCarl).eq(300);
            });
        });

        describe('With a participant doing an emergency withdraw LP2 after 160 seconds', function () {
            before (async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 159);
                await boostedFarm.connect(carl).emergencyWithdraw(1);
            });

            it('Gives carl 500 LP', async () => {
                const balanceLP2 = await stake2Token.balanceOf(carl.address);
                expect(balanceLP2).eq(800);
            });

            it('Gives carl no rewardTokens and no boosterTokens', async () => {
                const balanceReward = await rewardToken.balanceOf(carl.address);
                expect(balanceReward).eq(parseUnits("3300", rewardTokenDecimals));

                const balanceBooster = await boosterToken.balanceOf(carl.address);
                expect(balanceBooster).eq(parseUnits("6600", boosterTokenDecimals));
            });

            it('Holds no LP2 for carl', async () => {
                const depositCarl  = await boostedFarm.deposited(1, carl.address);
                expect(depositCarl).eq(0);
            });

            it('Has no rewardTokens and no boosterTokens reserved for carl', async () => {
                const pendingCarl = await boostedFarm.pending(1, carl.address);
                expect(pendingCarl[0]).eq(0);
                expect(pendingCarl[1]).eq(0);
            });

            it('Holds 1000 LP2 for alice', async () => {
                const balanceFarm = await stake2Token.balanceOf(boostedFarm.address);
                expect(balanceFarm).eq(1000);

                const depositAlice = await boostedFarm.deposited(1, alice.address);
                expect(depositAlice).eq(1000);
            });

            it('Has 750 rewardTokens and 1500 boosterTokens reserved for alice(receives bobs share)', async () => {
                const pendingAlice = await boostedFarm.pending(1, alice.address);
                expect(pendingAlice[0]).eq(parseUnits("750", rewardTokenDecimals));
            });
        });

        describe('When closed after 180 seconds', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 180);
            });

            it('Has a total reward of 10950 rewardTokens and 21900 boosterTokens pending', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("10950", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("21900", boosterTokenDecimals));
            });

            it('Reserved 75% for LP with 5450 rewardTokens and 10900 boosterTokens for bob, 4000 rewardTokens and 8000 boosterTokens for carl', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("5450", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("10900", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("4000", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("8000", boosterTokenDecimals));
            });

            it('Reserved 25% for LP2 with 1250 for alice', async () => {
                const pendingAlice = await boostedFarm.pending(1, alice.address);
                expect(pendingAlice[0]).eq(parseUnits("1250", rewardTokenDecimals));
                expect(pendingAlice[1]).eq(parseUnits("2500", boosterTokenDecimals));

                const pendingBob = await boostedFarm.pending(1, bob.address);
                expect(pendingBob[0]).eq(0);
                expect(pendingBob[1]).eq(0);

                const pendingCarl = await boostedFarm.pending(1, carl.address);
                expect(pendingCarl[0]).eq(0);
                expect(pendingCarl[1]).eq(0);

            });
        });

        describe('When closed for 20 seconds (after 200 seconds)', function () {
            before(async () => {
                await advanceTimeAndBlock(startTimestamp - await currentTimestamp() + 180);
            });

            it('Still has a total reward of 10950 rewardTokens and 21900 boosterTokens pending', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("10950", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("21900", boosterTokenDecimals));
            });

            it('Has a pending reward for LP of 5450 rewardTokens and 10900 boosterTokens for bob, 4000 rewardTokens and 8000 boosterTokens for carl', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(parseUnits("5450", rewardTokenDecimals));
                expect(pendingBob[1]).eq(parseUnits("10900", boosterTokenDecimals));

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(parseUnits("4000", rewardTokenDecimals));
                expect(pendingCarl[1]).eq(parseUnits("8000", boosterTokenDecimals));

            });

            it('Has a pending 1250 rewardTokens and 2500 boosterTokens for LP2 for alice', async () => {
                const pendintAlice = await boostedFarm.pending(1, alice.address);
                expect(pendintAlice[0]).eq(parseUnits("1250", rewardTokenDecimals));
                expect(pendintAlice[1]).eq(parseUnits("2500", boosterTokenDecimals));

                const pendingBob = await boostedFarm.pending(1, bob.address);
                expect(pendingBob[0]).eq(0);
                expect(pendingBob[1]).eq(0);

                const pendingCarl = await boostedFarm.pending(1, carl.address);
                expect(pendingCarl[0]).eq(0);
                expect(pendingCarl[1]).eq(0);
            });

            it('Will not accept new funds', async () => {
                await expect(boostedFarm.fund(parseUnits("1000", rewardTokenDecimals), parseUnits("2000", boosterTokenDecimals))).to.be.revertedWith('FarmClosed');
            });

        });

        describe('With participants withdrawing after closed', function () {
            before(async () => {
                await boostedFarm.connect(alice).withdraw(1, 1000);
                await boostedFarm.connect(bob).withdraw(0, 500);
                await boostedFarm.connect(carl).withdraw(0, 500);
            });

            it('Gives alice 1250 rewardTokens and 2500 boosterTokens and 1000 LP2', async () => {
                const balanceAliceReward = await rewardToken.balanceOf(alice.address);
                expect(balanceAliceReward).eq(parseUnits("5000", rewardTokenDecimals));

                const balanceAliceBooster = await boosterToken.balanceOf(alice.address);
                expect(balanceAliceBooster).eq(parseUnits("10000", boosterTokenDecimals));

                const balanceAliceLP = await stake1Token.balanceOf(alice.address);
                expect(balanceAliceLP).eq(5000);

                const balanceAliceLP2 = await stake2Token.balanceOf(alice.address);
                expect(balanceAliceLP2).eq(1000);
            });

            it('Gives carl 5450 rewardTokens and 10900 boosterTokens and 500 LP', async () => {
                const balanceCarlReward = await rewardToken.balanceOf(carl.address);
                expect(balanceCarlReward).eq(parseUnits("7300", rewardTokenDecimals));

                const balanceCarlBooster = await boosterToken.balanceOf(carl.address);
                expect(balanceCarlBooster).eq(parseUnits("14600", boosterTokenDecimals));

                const balanceCarlLP = await stake1Token.balanceOf(carl.address);
                expect(balanceCarlLP).eq(2000);

                const balanceCarlLP2 = await stake2Token.balanceOf(carl.address);
                expect(balanceCarlLP2).eq(800);

            });

            it('Has an end balance of 250 rewardTokens and 500 boosterTokens which is lost forever', async () => {
                const totalPending = await boostedFarm.totalPending();
                expect(totalPending[0]).eq(parseUnits("250", rewardTokenDecimals));
                expect(totalPending[1]).eq(parseUnits("500", boosterTokenDecimals));

                const balanceFarmReward = await rewardToken.balanceOf(boostedFarm.address);
                expect(balanceFarmReward).eq(parseUnits("250", rewardTokenDecimals));

                const balanceFarmBooster = await boosterToken.balanceOf(boostedFarm.address);
                expect(balanceFarmBooster).eq(parseUnits("500", boosterTokenDecimals));
            });

            it('Has no pending rewardTokens and boosterTokens for all participants for LP', async () => {
                const pendingAlice = await boostedFarm.pending(0, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);

                const pendingBob = await boostedFarm.pending(0, bob.address);
                expect(pendingBob[0]).eq(0);
                expect(pendingBob[1]).eq(0);

                const pendingCarl = await boostedFarm.pending(0, carl.address);
                expect(pendingCarl[0]).eq(0);
                expect(pendingCarl[1]).eq(0);
            });

            it('Has no pending rewardTokens and boosterTokens for all participants for LP2', async () => {
                const pendingAlice = await boostedFarm.pending(1, alice.address);
                expect(pendingAlice[0]).eq(0);
                expect(pendingAlice[1]).eq(0);

                const pendingBob = await boostedFarm.pending(1, bob.address);
                expect(pendingBob[0]).eq(0);
                expect(pendingBob[1]).eq(0);

                const pendingCarl = await boostedFarm.pending(1, carl.address);
                expect(pendingCarl[0]).eq(0);
                expect(pendingCarl[1]).eq(0);
            });
        });
    });

});