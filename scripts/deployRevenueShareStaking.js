const hre = require('hardhat');
const { getJson, saveJson, sleep, jsons } = require('./utils');
const { ethers } = require('hardhat');
const {currentTimestamp} = require("../test/helpers");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const wait = async () => {await sleep(3000)};

async function main() {
    const treasuryAddress = '0x328f7689244Bd7D042c4aE9eC18077b6781D6Dd8';
    const rewardToken = await hre.ethers.getContractAt('Token', '0xf983afa393199d6902a1dd04f8e93465915ffd8b');//USDT
    const dragonswapToken = await hre.ethers.getContractAt('Token', '0x7b75109369ACb528d9fa989E227812a6589712b9');

    const revenueShareStakingFactory = await hre.ethers.getContractFactory('DragonswapRevenueShareStaking');

    const revenueShareStaking = await revenueShareStakingFactory.deploy(
        dragonswapToken.address,
        rewardToken.address,
        treasuryAddress,
        300
    );

    await revenueShareStaking.deployed();
    console.log(`DragonswapRevenueShareStaking address: ${revenueShareStaking.address}`);
    saveJson(jsons.addresses, hre.network.name, 'DragonswapRevenueShareStaking', revenueShareStaking.address);

    await wait();

    await rewardToken.approve(revenueShareStaking.address, ethers.utils.parseUnits('1000000', await rewardToken.decimals()));
    await wait();
    await rewardToken.transfer(revenueShareStaking.address, ethers.utils.parseUnits('1000000', await rewardToken.decimals()));
    await wait();

    console.log('Done!');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
