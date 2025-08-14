import { ethers } from "ethers";

// 创建随机的wallet对象
const wallet1 = ethers.Wallet.createRandom();

// 利用私钥和provider创建wallet对象
const privateKey =
  "0x227dbb8586117d55284e26620bc76534dfbd2394be34cf4a09cb775d593b6f2b";
const wallet2 = new ethers.Wallet(privateKey, provider);

// 从助记词创建wallet对象
const wallet3 = ethers.Wallet.fromPhrase(mnemonic.phrase);

const main = async () => {
  // 创建交易对象
  const tx = {
    to: address1,
    value: ethers.parseEther("0.001"),
  };

  //发送交易，获得收据
  const txRes = await wallet1.sendTransaction(tx);
  const receipt = await txRes.wait(); // 等待链上确认交易
  console.log(receipt); // 打印交易的收据
};
main();
