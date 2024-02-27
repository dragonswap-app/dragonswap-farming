const { ethers } = require('hardhat');

const blockTimestamp = async () => {
  return (await ethers.provider.getBlock('latest')).timestamp;
};

const mineBlock = async () => {
  await network.provider.send('evm_mine');
};

const increaseTime = async (time) => {
  await hre.network.provider.send('evm_increaseTime', [time]);
  await mineBlock();
};

module.exports = {
  blockTimestamp,
  mineBlock,
  increaseTime,
};
