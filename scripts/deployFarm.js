const hre = require('hardhat');
const { getJson, saveJson, jsons } = require('./utils');
const { ethers } = require('hardhat');
const {currentTimestamp} = require("../test/helpers");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function main() {
    await hre.run('compile');

    const dragonswapStakerFactoryAddress = getJson(jsons.addresses)[hre.network.name][
        'DragonswapStakerFactory'
        ];

    const dragonswapStakerFactory = await hre.ethers.getContractAt(
        'DragonswapStakerFactory', dragonswapStakerFactoryAddress
    );

    if(await dragonswapStakerFactory.implClassic() === ZERO_ADDRESS) {
        const stakerFarmImplFactory = await hre.ethers.getContractFactory('DragonswapStakerFarm');
        const stakerFarmImplClassic = await stakerFarmImplFactory.deploy();
        await stakerFarmImplClassic.deployed();
        console.log(`DragonswapStaker address: ${stakerFarmImplClassic.address}`);

        saveJson(
            jsons.addresses,
            hre.network.name,
            'DragonswapStakerImplClassic',
            stakerFarmImplClassic.address
        );

        await dragonswapStakerFactory.setImplClassic(stakerFarmImplClassic.address);
    }

    const tokenToStakeAddress = getJson(jsons.config)[hre.network.name]['PYTH'];

    const rewardTokenAddress = getJson(jsons.config)[hre.network.name]['DSWAP'];
    const rewardToken = await hre.ethers.getContractAt('Token', rewardTokenAddress);

    const rewardPerSecond = ethers.utils.parseEther('10');
    const startTimestamp = await currentTimestamp() + 120;
    const rewardAmount = ethers.utils.parseUnits('1000000', await rewardToken.decimals());

    const stakerFarmTx = await dragonswapStakerFactory.deployClassic(
        rewardToken.address,
        rewardPerSecond,
        startTimestamp
    )

    const stakerFarmTxReceipt = await stakerFarmTx.wait()

    const stakerFarm = await hre.ethers.getContractAt('DragonswapStaker', stakerFarmTxReceipt.logs[0].address)

    await stakerFarm.add(100, tokenToStakeAddress, false)

    await rewardToken.approve(stakerFarm.address, rewardAmount)

    await stakerFarm.fund(rewardAmount)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
