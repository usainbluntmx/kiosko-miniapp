// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PaymentHub {
    event PaymentSettled(
        address indexed from,
        address indexed to,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        string   txRef
    );

    function recordPayment(
        address to,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        string calldata txRef
    ) external {
        require(to != address(0), "invalid receiver");
        emit PaymentSettled(msg.sender, to, tokenIn, tokenOut, amountIn, amountOut, txRef);
    }
}