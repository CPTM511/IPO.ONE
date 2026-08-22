// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract ToolchainAdmissionTest is Test {
    function testPinnedMathMulDivCompilesAndRoundsDown() public pure {
        assertEq(Math.mulDiv(10, 3, 4), 7);
    }

    function testFuzzPinnedMathMulDivPreservesExactProducts(uint128 left, uint128 right) public pure {
        assertEq(Math.mulDiv(uint256(left), uint256(right), 1), uint256(left) * uint256(right));
    }
}
