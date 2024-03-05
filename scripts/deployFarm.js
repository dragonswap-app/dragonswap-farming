const hre = require('hardhat');
const { getJson, saveJson, sleep, jsons } = require('./utils');
const { ethers } = require('hardhat');
const {currentTimestamp} = require("../test/helpers");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const wait = async () => {await sleep(3000)};

async function main() {

    const dragonswapStakerFactoryAddress = getJson(jsons.addresses)[hre.network.name][
        'DragonswapStakerFactory'
        ];

    const dragonswapStakerFactory = await hre.ethers.getContractAt(
        'DragonswapStakerFactory', dragonswapStakerFactoryAddress
    );

    if(await dragonswapStakerFactory.implClassic() === ZERO_ADDRESS) {
        const stakerFarmImplFactory = await hre.ethers.getContractFactory('DragonswapStaker');
        const stakerFarmImplClassic = await stakerFarmImplFactory.deploy();
        await stakerFarmImplClassic.deployed();
        console.log(`DragonswapStaker address: ${stakerFarmImplClassic.address}`);

        saveJson(
            jsons.addresses,
            hre.network.name,
            'DragonswapStakerImplClassic',
            stakerFarmImplClassic.address
        );

        await dragonswapStakerFactory.setImplementationClassic(stakerFarmImplClassic.address);
        console.log('Classic implementation set on factory');
    }

    const tokenToStakeAddress = getJson(jsons.config)[hre.network.name]['PYTH'];

    const rewardTokenAddress = getJson(jsons.config)[hre.network.name]['DSWAP'];
    const rewardToken = await hre.ethers.getContractAt('Token', rewardTokenAddress);

    const rewardPerSecond = ethers.utils.parseEther('0.0023148148148148');
    const startTimestamp = await currentTimestamp() + 120;
    const rewardAmount = ethers.utils.parseUnits('50000', await rewardToken.decimals());

    const stakerFarmTx = await dragonswapStakerFactory.deployClassic(
        rewardToken.address,
        rewardPerSecond,
        startTimestamp
    )

    const stakerFarmTxReceipt = await stakerFarmTx.wait()

    const stakerFarm = await hre.ethers.getContractAt('DragonswapStaker', stakerFarmTxReceipt.logs[0].address)

    saveJson(
        jsons.addresses,
        hre.network.name,
        'DragonswapStaker',
        stakerFarm.address
    );

    console.log("Staker farm address: ", stakerFarm.address);

    await wait();

    await stakerFarm.add(100, tokenToStakeAddress, false)

    console.log("Staking pool added");

    await rewardToken.approve(stakerFarm.address, rewardAmount)

    await wait();

    await stakerFarm.fund(rewardAmount)
    console.log("Funded staker farm");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
