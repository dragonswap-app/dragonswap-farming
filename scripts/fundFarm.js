const hre = require('hardhat');
const { getJson, jsons } = require('./utils');
const {ethers} = require("hardhat");

async function main() {

    const farmAddress = "0x603BfA58dBD9F4C0955F906473C80F04F001120a";

    const rewardTokenAddress = getJson(jsons.config)[hre.network.name]['ISEI'];
    const rewardToken = await hre.ethers.getContractAt('Token', rewardTokenAddress);

    const rewardAmount = ethers.utils.parseUnits('144980', await rewardToken.decimals());

    await rewardToken.approve(farmAddress, rewardAmount);

    const stakerFarm = await hre.ethers.getContractAt('DragonswapStaker', farmAddress);

    // await stakerFarm.fund(rewardAmount)
    console.log("Funded staker farm");

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
