import { ethers } from "ethers";
import { configDotenv } from "dotenv";
configDotenv();

const INFURA_API_KEY = process.env.INFURA_API_KEY;
const providerINFURA = new ethers.JsonRpcProvider(
  `https://base-sepolia.infura.io/v3/${INFURA_API_KEY}`
);

const main = async () => {
  console.log("\n1. 查询provider连接到了哪条链");
  const network = await providerINFURA.getNetwork();
  console.log(network.toJSON());

  console.log("\n2. 查询区块高度");
  const blockNumber = await providerINFURA.getBlockNumber();
  console.log(blockNumber);

  console.log("\n7. 给定合约地址查询合约bytecode，例子用的WETH地址");
  const code = await providerINFURA.getCode(
    "0xc778417e063141139fce010982780140aa0cd5ab"
  );
  console.log(code);
};

main();
