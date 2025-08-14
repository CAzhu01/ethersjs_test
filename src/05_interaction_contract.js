import { ethers } from "ethers";
import { config as configDotenv } from "dotenv";

// 教学目标：
// - 如何连接网络与读取基础信息
// - 如何读取合约（ERC20）只读数据
// - 如何使用静态调用（staticCall）与估算 Gas、构造交易
// - 如何发送写交易（带开关，默认不发送）
// - 如何订阅/查询事件与读取交易、回执

configDotenv();

// 环境变量与默认值（尽量让脚本即开即用）
const INFURA_API_KEY = process.env.INFURA_API_KEY;
const NETWORK = process.env.NETWORK || "sepolia"; // mainnet | sepolia | base-sepolia
const PRIVATE_KEY = process.env.PRIVATE_KEY || ""; // 可选：用于签名写交易
const SEND_TX = /^true$/i.test(process.env.SEND_TX || ""); // 只有当 SEND_TX=true 才会真的发送交易

// 业务参数（可在 .env 中覆盖）
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || ""; // 需要你提供一个该网络上真实存在的 ERC20 地址
const HOLDER_ADDRESS = process.env.HOLDER_ADDRESS || ""; // 用于读取余额的地址（留空则使用 signer 地址或演示地址）
const SPENDER_ADDRESS = process.env.SPENDER_ADDRESS || ""; // 用于 allowance/approve 的地址
const TX_HASH = process.env.TX_HASH || ""; // 可选：用于读取交易/回执

// 简易正则校验地址
const isAddress = (a) => /^0x[a-fA-F0-9]{40}$/.test(a || "");

// ERC20 最小只读 ABI + 写方法（approve/transfer）
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// 不同网络的 Infura 入口
function rpcUrlFromNetwork(net, key) {
  if (!key) return "";
  switch (net) {
    case "mainnet":
      return `https://mainnet.infura.io/v3/${key}`;
    case "sepolia":
      return `https://sepolia.infura.io/v3/${key}`;
    case "base-sepolia":
      return `https://base-sepolia.infura.io/v3/${key}`;
    default:
      // 也可以支持自定义 RPC：当 NETWORK 是完整 URL 时直接返回
      return /^https?:\/\//i.test(net) ? net : "";
  }
}

async function main() {
  // 0) Provider 初始化
  const url = rpcUrlFromNetwork(NETWORK, INFURA_API_KEY);
  if (!url) {
    console.warn(
      `未提供有效的 RPC。请设置 INFURA_API_KEY，或将 NETWORK 设置为完整 RPC URL（当前 NETWORK=${NETWORK}).`
    );
    return;
  }
  const provider = new ethers.JsonRpcProvider(url);

  // 1) 基础网络信息
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  const blockNumber = await provider.getBlockNumber();
  const feeData = await provider.getFeeData();
  console.log("==== 1) 网络信息 ====");
  console.log(`已连接到: ${NETWORK} (chainId=${chainId})`);
  console.log(`最新区块: ${blockNumber}`);
  console.log(
    `建议 gasPrice: ${
      feeData.gasPrice
        ? ethers.formatUnits(feeData.gasPrice, "gwei") + " gwei"
        : "N/A"
    }`
  );

  // 2) Signer（可选）与基础余额读取
  let wallet;
  if (PRIVATE_KEY) {
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log("已加载 signer:", wallet.address);
  } else {
    console.log("未提供 PRIVATE_KEY，将仅进行只读演示。");
  }

  const balanceTarget = isAddress(HOLDER_ADDRESS)
    ? HOLDER_ADDRESS
    : wallet?.address || "0x0000000000000000000000000000000000000000";
  const ethBal = await provider.getBalance(balanceTarget);
  console.log("==== 2) 余额读取 ====");
  console.log(`${balanceTarget} 的原生币余额:`, ethers.formatEther(ethBal));

  // 3) ERC20 只读演示（如果提供了 TOKEN_ADDRESS）
  if (isAddress(TOKEN_ADDRESS)) {
    // 使用 provider 创建只读实例
    const erc20 = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      erc20.name(),
      erc20.symbol(),
      erc20.decimals(),
    ]);
    const totalSupply = await erc20.totalSupply();
    console.log("==== 3) ERC20 只读 ====");
    console.log(`Token: ${name} (${symbol}), decimals=${decimals}`);
    console.log(`总量: ${ethers.formatUnits(totalSupply, decimals)} ${symbol}`);

    if (balanceTarget && isAddress(balanceTarget)) {
      const tokenBal = await erc20.balanceOf(balanceTarget);
      console.log(
        `${balanceTarget} 的 ${symbol} 余额: ${ethers.formatUnits(
          tokenBal,
          decimals
        )}`
      );
    }

    if (isAddress(balanceTarget) && isAddress(SPENDER_ADDRESS)) {
      const currentAllowance = await erc20.allowance(
        balanceTarget,
        SPENDER_ADDRESS
      );
      console.log(
        `allowance(${balanceTarget} -> ${SPENDER_ADDRESS}): ${ethers.formatUnits(
          currentAllowance,
          decimals
        )} ${symbol}`
      );
    }

    // 4) 写交互教学：静态模拟、估算 Gas、构造交易、可选发送
    if (wallet) {
      const erc20WithSigner = erc20.connect(wallet);
      const demoTo = SPENDER_ADDRESS || wallet.address; // 演示用：给自己或 SPENDER_ADDRESS 转账/授权
      const demoAmount = ethers.parseUnits("0.001", decimals); // 演示数量

      console.log("==== 4) 写交互（approve/transfer）教学 ====");

      // 4.1 静态模拟（不会上链）：
      try {
        const okApprove = await erc20WithSigner.approve.staticCall(
          demoTo,
          demoAmount
        );
        console.log("staticCall approve 可行:", okApprove);
      } catch (e) {
        console.log(
          "staticCall approve 失败(常见因余额/权限/黑名单):",
          e?.shortMessage || e?.message
        );
      }

      try {
        const okTransfer = await erc20WithSigner.transfer.staticCall(
          demoTo,
          demoAmount
        );
        console.log("staticCall transfer 可行:", okTransfer);
      } catch (e) {
        console.log(
          "staticCall transfer 失败(常见因余额不足):",
          e?.shortMessage || e?.message
        );
      }

      // 4.2 估算 Gas：
      try {
        const gasApprove = await erc20WithSigner.approve.estimateGas(
          demoTo,
          demoAmount
        );
        console.log("approve 估算 gas:", gasApprove.toString());
      } catch (e) {
        console.log("approve 估算 gas 失败:", e?.shortMessage || e?.message);
      }
      try {
        const gasTransfer = await erc20WithSigner.transfer.estimateGas(
          demoTo,
          demoAmount
        );
        console.log("transfer 估算 gas:", gasTransfer.toString());
      } catch (e) {
        console.log("transfer 估算 gas 失败:", e?.shortMessage || e?.message);
      }

      // 4.3 构造交易（不发送）：
      const txApproveReq = await erc20WithSigner.approve.populateTransaction(
        demoTo,
        demoAmount
      );
      console.log("approve populateTransaction:", txApproveReq);

      const txTransferReq = await erc20WithSigner.transfer.populateTransaction(
        demoTo,
        demoAmount
      );
      console.log("transfer populateTransaction:", txTransferReq);

      // 4.4 可选发送（需要 SEND_TX=true 且 PRIVATE_KEY 存在，注意可能失败/扣测试币）
      if (SEND_TX) {
        try {
          const tx = await erc20WithSigner.approve(demoTo, demoAmount);
          console.log("已发送 approve 交易:", tx.hash);
          const receipt = await tx.wait();
          console.log(
            "approve 回执: status=",
            receipt.status,
            "gasUsed=",
            receipt.gasUsed?.toString()
          );
        } catch (e) {
          console.log("approve 交易发送失败:", e?.shortMessage || e?.message);
        }
      } else {
        console.log("SEND_TX 未开启，跳过真实发送交易。");
      }
    } else {
      console.log("未提供 PRIVATE_KEY，跳过写交互教学。");
    }

    // 5) 事件查询（最近若干区块）
    const fromBlock = Math.max(0, blockNumber - 5000);
    const toBlock = blockNumber;
    try {
      const filterToMe = erc20.filters.Transfer(null, balanceTarget);
      const logs = await erc20.queryFilter(filterToMe, fromBlock, toBlock);
      console.log(
        `==== 5) 事件查询（Transfer -> ${balanceTarget}，近5000块）====`
      );
      console.log(`命中 ${logs.length} 条`);
      if (logs[0]) {
        const first = logs[0];
        console.log(
          "样例事件: block=",
          first.blockNumber,
          "tx=",
          first.transactionHash
        );
      }
    } catch (e) {
      console.log("事件查询失败:", e?.shortMessage || e?.message);
    }
  } else {
    console.log(
      "未提供 TOKEN_ADDRESS，跳过 ERC20 交互教学。可在 .env 设置 TOKEN_ADDRESS=合约地址。"
    );
  }

  // 6) 读取交易与回执（可选）
  if (TX_HASH) {
    console.log("==== 6) 交易与回执读取 ====");
    const tx = await provider.getTransaction(TX_HASH);
    console.log("交易: ", tx);
    const receipt = await provider.getTransactionReceipt(TX_HASH);
    console.log("回执: ", receipt);
  }

  console.log("教学演示结束。");
}

main().catch((e) => {
  console.error("脚本出错:", e?.shortMessage || e?.message || e);
});
