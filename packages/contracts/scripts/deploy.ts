// packages/contracts/scripts/deploy.ts
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect(); // <-- HH3 + plugin v4
  const Hub = await ethers.getContractFactory("PaymentHub");
  const hub = await Hub.deploy();
  await hub.waitForDeployment();
  console.log("PaymentHub:", await hub.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});