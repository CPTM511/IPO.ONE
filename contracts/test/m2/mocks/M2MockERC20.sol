// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract M2MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public override totalSupply;
    uint16 public feeBps;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackOnTransferFrom;

    mapping(address account => uint256 amount) public override balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public override allowance;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address account, uint256 amount) external {
        totalSupply += amount;
        balanceOf[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function setFeeBps(uint16 feeBps_) external {
        require(feeBps_ <= 1_000, "fee");
        feeBps = feeBps_;
    }

    function setTransferFromCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
        callbackOnTransferFrom = target != address(0);
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "allowance");
            allowance[from][msg.sender] = currentAllowance - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        if (callbackOnTransferFrom) {
            (bool success,) = callbackTarget.call(callbackData);
            require(success, "callback");
        }
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "recipient");
        require(balanceOf[from] >= amount, "balance");
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 received = amount - fee;
        balanceOf[from] -= amount;
        balanceOf[to] += received;
        emit Transfer(from, to, received);
        if (fee > 0) {
            totalSupply -= fee;
            emit Transfer(from, address(0), fee);
        }
    }
}
