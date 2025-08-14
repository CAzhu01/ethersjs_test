import { ethers } from "ethers";
import { configDotenv } from "dotenv";
configDotenv();
const INFURA_API_KEY = process.env.INFURA_API_KEY;

const provider = new ethers.JsonRpcProvider(
  `https://base-sepolia.infura.io/v3/${INFURA_API_KEY}`
);

// 请把下面的示例地址替换成你自己的，或从环境变量里读取
const TOKEN_ADDRESS =
  process.env.TOKEN_ADDRESS ?? "0xD4Bb0504bB80b143125BD74eC41d8aBE5fdaB810";
const HOLDER_ADDRESS =
  process.env.HOLDER_ADDRESS ?? "0x365a8b3f57A650DE13f145263E3a5B40c43d3bCd";
const SPENDER_ADDRESS =
  process.env.SPENDER_ADDRESS ?? "0x365a8b3f57A650DE13f145263E3a5B40c43d3bCd";
const TX_HASH = process.env.TX_HASH ?? ""; // 可选：想要演示读取交易/回执时填入

// 常用 ERC20 读取所需最小 ABI（只读）
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const isAddress = (a) => /^0x[a-fA-F0-9]{40}$/.test(a);

const main = async () => {
  // 1) 基础网络信息读取（常用）
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);

  // 改成base-sepolia
  if (chainId !== 84532) {
    console.warn(
      `警告: 当前 provider 非 base-sepolia (chainId=${chainId})，请确认 RPC。`
    );
  }
  const blockNumber = await provider.getBlockNumber();
  const feeData = await provider.getFeeData();
  console.log(`已连接到: ${net.name} (chainId=${chainId})`);
  console.log(`最新区块: ${blockNumber}`);
  console.log(
    `建议 gasPrice: ${
      feeData.gasPrice
        ? ethers.formatUnits(feeData.gasPrice, "gwei") + " gwei"
        : "N/A"
    }`
  );

  // 2) 读取最新区块详情（开发中常检查时间戳/出块间隔）
  const latestBlock = await provider.getBlock(blockNumber);
  console.log(`最新区块时间戳: ${latestBlock?.timestamp}`);

  // 3) 读取任意地址 ETH 余额（on-chain 账户/合约地址都可）
  if (isAddress(HOLDER_ADDRESS)) {
    const ethBalance = await provider.getBalance(HOLDER_ADDRESS);
    console.log(
      `地址 ${HOLDER_ADDRESS} 的 ETH 余额: ${ethers.formatEther(
        ethBalance
      )} ETH`
    );
  } else {
    console.log("HOLDER_ADDRESS 未设置为有效地址，跳过 ETH 余额读取。");
  }

  // 4) 合约存在性检测（避免调用不存在的合约导致报错）
  if (!isAddress(TOKEN_ADDRESS)) {
    console.log("TOKEN_ADDRESS 未设置为有效地址，跳过 ERC20 相关读取。");
    return;
  }
  const code = await provider.getCode(TOKEN_ADDRESS);
  if (code === "0x") {
    console.log(`地址 ${TOKEN_ADDRESS} 上没有合约代码，可能填错地址。`);
    return;
  }

  // 5) 创建合约实例（只读）
  const erc20 = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);

  // 6) 常用 ERC20 只读：name/symbol/decimals/totalSupply
  const [name, symbol, decimals] = await Promise.all([
    erc20.name(),
    erc20.symbol(),
    erc20.decimals(),
  ]);
  const totalSupply = await erc20.totalSupply(); // v6 为 bigint
  console.log(`Token: ${name} (${symbol}), decimals=${decimals}`);
  console.log(`总量: ${ethers.formatUnits(totalSupply, decimals)} ${symbol}`);

  // 7) 常用 ERC20 只读：某地址余额、授权额度
  if (isAddress(HOLDER_ADDRESS)) {
    const bal = await erc20.balanceOf(HOLDER_ADDRESS);
    console.log(
      `地址 ${HOLDER_ADDRESS} 的 ${symbol} 余额: ${ethers.formatUnits(
        bal,
        decimals
      )} ${symbol}`
    );
  } else {
    console.log("HOLDER_ADDRESS 未设置为有效地址，跳过 ERC20 余额读取。");
  }

  if (isAddress(HOLDER_ADDRESS) && isAddress(SPENDER_ADDRESS)) {
    const allowance = await erc20.allowance(HOLDER_ADDRESS, SPENDER_ADDRESS);
    console.log(
      `授权(allowance): owner=${HOLDER_ADDRESS} -> spender=${SPENDER_ADDRESS}: ${ethers.formatUnits(
        allowance,
        decimals
      )} ${symbol}`
    );
  } else {
    console.log(
      "未提供有效的 HOLDER_ADDRESS/SPENDER_ADDRESS，跳过 allowance 读取。"
    );
  }

  // 8) 查询最近 N 个区块内的 Transfer 事件（常用：做索引/活动追踪）
  const fromBlock = Math.max(0, blockNumber - 5000); // 最近 ~5000 个区块
  const transferEvents = await erc20.queryFilter(
    "Transfer",
    fromBlock,
    blockNumber
  );
  console.log(
    `最近 ${blockNumber - fromBlock + 1} 个区块内的 Transfer 事件数量: ${
      transferEvents.length
    }`
  );
  // 只打印前几个，避免刷屏
  for (const e of transferEvents.slice(0, 5)) {
    const from = e.args?.from;
    const to = e.args?.to;
    const value = e.args?.value;
    console.log(
      `Transfer | block=${e.blockNumber} tx=${e.transactionHash} ` +
        `${from} -> ${to} : ${ethers.formatUnits(value, decimals)} ${symbol}`
    );
  }

  // 如需仅查看和某个地址相关的 Transfer，可手动过滤
  if (isAddress(HOLDER_ADDRESS)) {
    const related = transferEvents.filter(
      (e) =>
        e.args?.from?.toLowerCase() === HOLDER_ADDRESS.toLowerCase() ||
        e.args?.to?.toLowerCase() === HOLDER_ADDRESS.toLowerCase()
    );
    console.log(
      `与地址 ${HOLDER_ADDRESS} 相关的 Transfer 数量: ${related.length}`
    );
  }

  // 9) 读取合约字节码大小（有时用于判断代理/实现合约体量）
  console.log(`合约代码长度(bytes): ${(code.length - 2) / 2}`);

  // 10) 可选：读取交易与回执（分析一次调用的 gas 用量 / 事件）
  if (TX_HASH && TX_HASH.startsWith("0x")) {
    const tx = await provider.getTransaction(TX_HASH);
    if (tx) {
      console.log(
        `交易 ${TX_HASH} 的 nonce=${tx.nonce}, gasLimit=${tx.gasLimit}`
      );
      const receipt = await provider.getTransactionReceipt(TX_HASH);
      if (receipt) {
        console.log(
          `回执: status=${receipt.status} gasUsed=${receipt.gasUsed} block=${receipt.blockNumber}`
        );
        // 打印回执中的日志数量
        console.log(`日志数量: ${receipt.logs.length}`);
      }
    } else {
      console.log("找不到该交易，可能未上链或哈希错误。");
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
