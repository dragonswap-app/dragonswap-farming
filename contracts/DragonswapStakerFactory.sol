// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DragonswapStakerFactory is Ownable {
    enum Impl {
        NONE,
        CLASSIC,
        BOOSTED
    }

    // Type of contracts deployed by factory
    mapping(address => Impl) public deploymentToImplType;
    // Array of all sale deployments
    address[] public deployments;
    // Classic staker contract implementation
    address public implClassic;
    // Boosted staker contract implementation
    address public implBoosted;

    // Events
    event Deployed(address clone, Impl impType);
    event ImplementationSet(address implementation, Impl impType);

    // Errors
    error CloneCreationFailed();
    error ImplementationNotSet();
    error ImplementationAlreadySet();
    error InvalidIndexRange();

    constructor(address owner_) Ownable(owner_) {}

    /**
     * @dev Function to set new classic staker implementation
     */
    function setImplementationClassic(address implementation) external onlyOwner {
        // Require that implementation is different from current one
        if (implClassic == implementation) {
            revert ImplementationAlreadySet();
        }
        // Set new implementation
        implClassic = implementation;
        // Emit relevant event
        emit ImplementationSet(implementation, Impl.CLASSIC);
    }

    /**
     * @dev Function to set new boosted staker implementation
     */
    function setImplementationBoosted(address implementation) external onlyOwner {
        // Require that implementation is different from current one
        if (implBoosted == implementation) {
            revert ImplementationAlreadySet();
        }
        // Set new implementation
        implBoosted = implementation;
        // Emit relevant event
        emit ImplementationSet(implementation, Impl.BOOSTED);
    }

    /**
     * @dev Deployment wrapper for classic staker implementation
     */
    function deployClassic(address rewardToken, uint256 rewardPerSecond, uint256 startTimestamp) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,uint256,uint256)",
            owner(),
            rewardToken,
            rewardPerSecond,
            startTimestamp
        );
        deploy(data, Impl.CLASSIC);
    }

    /**
     * @dev Deployment wrapper for boosted staker implementation
     */
    function deployBoosted(
        address rewardToken,
        address boostedToken,
        uint256 rewardPerSecond,
        uint256 startTimestamp
    ) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,address,uint256,uint256)",
            owner(),
            rewardToken,
            boostedToken,
            rewardPerSecond,
            startTimestamp
        );
        deploy(data, Impl.BOOSTED);
    }

    /**
     * @dev Function to make a new deployment and initialize clone instance
     */
    function deploy(bytes memory data, Impl implType) private {
        address impl = implType == Impl.CLASSIC
            ? implClassic
            : implType == Impl.BOOSTED
                ? implBoosted
                : address(0);

        // Require that implementation is set
        if (impl == address(0)) {
            revert ImplementationNotSet();
        }

        // Newly deployed clone instance address will be stored inside of this variable
        address instance;

        /// @solidity memory-safe-assembly
        assembly {
            // Cleans the upper 96 bits of the `implementation` word, then packs the first 3 bytes
            // of the `implementation` address with the bytecode before the address.
            mstore(0x00, or(shr(0xe8, shl(0x60, impl)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            // Packs the remaining 17 bytes of `implementation` with the bytecode after the address.
            mstore(0x20, or(shl(0x78, impl), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(0, 0x09, 0x37)
        }
        // Require that clone is created
        if (instance == address(0)) {
            revert CloneCreationFailed();
        }

        // Mark sale as created through official factory
        deploymentToImplType[instance] = implType;
        // Add sale to allSales
        deployments.push(instance);

        // Initialize
        if (data.length > 0) {
            (bool success, ) = instance.call{value: msg.value}(data);
            if (!success) revert();
        }

        // Emit relevant event
        emit Deployed(instance, implType);
    }

    /**
     * @dev Function to retrieve total number of deployments made by this factory
     */
    function noOfDeployments() public view returns (uint256) {
        return deployments.length;
    }

    /**
     * @dev Function to retrieve the address of the latest deployment made by this factory
     * @return Latest deployment address
     */
    function getLatestDeployment() external view returns (address) {
        uint256 _noOfDeployments = noOfDeployments();
        if (_noOfDeployments > 0) return deployments[_noOfDeployments - 1];
        // Return zero address if no deployments were made
        return address(0);
    }

    /**
     * @dev Function to retrieve all deployments between indexes
     * @param startIndex First index
     * @param endIndex Last index
     * @return _deployments All deployments between provided indexes, inclusive
     */
    function getAllDeployments(
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (address[] memory _deployments) {
        // Require valid index input
        if (endIndex < startIndex || endIndex >= deployments.length) {
            revert InvalidIndexRange();
        }
        // Initialize new array
        _deployments = new address[](endIndex - startIndex + 1);
        uint index = 0;
        // Fill the array with sale addresses
        for (uint i = startIndex; i <= endIndex; i++) {
            _deployments[index] = deployments[i];
            index++;
        }
    }

    /**
     * @dev See if a clone was deployed through this factory
     */
    function isDeployedThroughFactory(address deployment) external view returns (bool) {
        return uint8(deploymentToImplType[deployment]) > 0;
    }
}
