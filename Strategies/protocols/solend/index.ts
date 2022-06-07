import {
  makeCreateMangoAccountInstruction,
  makeDepositInstruction,
  PublicKey,
  BN,
  MangoAccount,
} from '@blockworks-foundation/mango-client'
import {
  getInstructionDataFromBase64,
  getNativeTreasuryAddress,
  serializeInstructionToBase64,
} from '@solana/spl-governance'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { depositReserveLiquidityInstruction } from '@solendprotocol/solend-sdk'
import { fmtMintAmount } from '@tools/sdk/units'
import tokenService from '@utils/services/token'
import {
  createProposal,
  InstructionDataWithHoldUpTime,
} from 'actions/createProposal'
import axios from 'axios'
import { MarketStore } from 'Strategies/store/marketStore'
import { TreasuryStrategy } from 'Strategies/types/types'

const MAINNET_PROGRAM = 'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo'
const DEVNET_PROGRAM = 'ALend7Ketfx5bxh6ghsCDXAoDrhvEmsXT3cynB6aPLgx'

export const SOLEND = 'Solend'
const SOLEND_SYMBOL = 'SLND'
const SOLEND_PROTOCOL_LOGO_URI =
  'https://solend-image-assets.s3.us-east-2.amazonaws.com/1280-circle.png'

const SOLEND_ENDPOINT = 'https://api.solend.fi'

async function getConfig() {
  return await (
    await axios.get(`${SOLEND_ENDPOINT}/v1/config?deployment=production`)
  ).data
}

export async function getSolendStrategies() {
  const strats: TreasuryStrategy[] = []

  // method to fetch solend strategies
  const config = await getConfig()
  const mainMarket = config.markets.find((market) => market.isPrimary)
  const stats = (
    await (
      await axios.get(
        `${SOLEND_ENDPOINT}/v1/reserves?ids=${mainMarket.reserves
          .map((reserve) => reserve.address)
          .join(',')}`
      )
    ).data
  ).results

  const metadataMap = config.assets.reduce((acc, asset) => ({
    ...acc,
    [asset.symbol]: {
      logo: asset.logo,
      mintAddress: asset.mintAddress,
    },
  }))

  for (const [i, reserve] of mainMarket.reserves.entries()) {
    const reserveStats = stats[i].reserve
    const rates = stats[i].rates
    const metadata = metadataMap[reserve.asset]

    if (!metadata) continue
    strats.push({
      liquidity:
        (reserveStats.liquidity.availableAmount /
          10 ** reserveStats.liquidity.mintDecimals) *
        (reserveStats.liquidity.marketPrice / 10 ** 18),
      handledTokenSymbol: reserve.asset,
      apy: `${Number(rates.supplyInterest).toFixed(2)}%`,
      protocolName: SOLEND,
      protocolSymbol: SOLEND_SYMBOL,
      handledMint: metadata.mintAddress,
      handledTokenImgSrc: metadata.logo || '',
      reserveAddress: reserve.address,
      protocolLogoSrc: SOLEND_PROTOCOL_LOGO_URI,
      strategyName: 'Deposit',
      strategyDescription:
        'Earn interest on your treasury assets by depositing into Solend.',
      isGenericItem: false,
      createProposalFcn: handleSolendDeposit,
    })
  }

  return strats
}

export const calculateAllDepositsInSolendAccountsForMint = (
  accounts: MangoAccount[],
  mint: PublicKey,
  market: MarketStore
) => {
  let deposited = 0
  const group = market!.group
  const depositIndex =
    mint &&
    group?.tokens.findIndex((x) => x.mint.toBase58() === mint.toBase58())
  if (accounts?.length && typeof depositIndex !== 'undefined' && group) {
    const depositsWithAmountHiherThenZero = accounts
      .map((x) => x.deposits[depositIndex])
      .filter((x) => !x?.isZero())
    if (depositsWithAmountHiherThenZero.length) {
      const currentDepositAmount = accounts
        .map((x) =>
          x
            ?.getUiDeposit(
              market.cache!.rootBankCache[depositIndex],
              group,
              depositIndex
            )
            .toNumber()
        )
        .reduce((prev, next) => (prev += next), 0)
      deposited += currentDepositAmount ? currentDepositAmount : 0
    }
  }
  return deposited
}

const handleSolendDeposit = async (
  rpcContext,
  form,
  realm,
  matchedTreasury,
  tokenOwnerRecord,
  governingTokenMint,
  proposalIndex,
  prerequisiteInstructions,
  isDraft,
  client
) => {
  const insts: InstructionDataWithHoldUpTime[] = []

  const slndProgramAddress =
    rpcContext.connection.cluster === 'mainnet'
      ? MAINNET_PROGRAM
      : DEVNET_PROGRAM
  const fmtAmount = fmtMintAmount(
    matchedTreasury.extensions.mint?.account,
    new BN(form.mintAmount)
  )

  const config = await getConfig()
  const lendingMarket = config.markets.find(
    (market) => market.address === form.lendingMarketAddress
  )
  const reserve = config.markets
    .flatMap((market) => market.reserves)
    .find(
      (reserve) =>
        reserve.address === matchedTreasury.extensions.mint.publicKey.toBase58()
    )
  const cTokenMintAddress = reserve.collateralMintAddress

  const ataDepositAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    new PublicKey(cTokenMintAddress),
    matchedTreasury!.extensions!.token!.account.owner,
    true
  )

  const depositAccountInfo = null
  if (!depositAccountInfo) {
    // generate the instruction for creating the ATA
    const createAtaIx = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      matchedTreasury.extensions.mint?.publicKey!,
      ataDepositAddress,
      matchedTreasury!.extensions!.token!.account.owner,
      matchedTreasury!.extensions!.token!.account.owner
    )
    prerequisiteInstructions.push(createAtaIx)
  }

  const depositSolendInsObj = {
    data: getInstructionDataFromBase64(
      serializeInstructionToBase64(
        depositReserveLiquidityInstruction(
          new BN(fmtAmount),
          matchedTreasury.extensions.token.publicKey,
          ataDepositAddress,
          new PublicKey(reserve.address),
          new PublicKey(reserve.liquidityAddress),
          new PublicKey(reserve.collateralMintAddress),
          new PublicKey(form.lendingMarketAddress),
          new PublicKey(lendingMarket.lendingMarketAuthority),
          new PublicKey(lendingMarket.authorityAddress),
          new PublicKey(slndProgramAddress)
        )
      )
    ),
    holdUpTime: matchedTreasury.governance!.account!.config
      .minInstructionHoldUpTime,
    prerequisiteInstructions: [...prerequisiteInstructions],
    chunkSplitByDefault: true,
  }
  insts.push(depositSolendInsObj)

  const proposalAddress = await createProposal(
    rpcContext,
    realm,
    matchedTreasury.governance!.pubkey,
    tokenOwnerRecord,
    form.title ||
      `Deposit ${fmtAmount} ${
        tokenService.getTokenInfo(
          matchedTreasury.extensions.mint!.publicKey.toBase58()
        )?.symbol || 'tokens'
      } to Mango account`,
    form.description,
    governingTokenMint,
    proposalIndex,
    insts,
    isDraft,
    client
  )
  return proposalAddress
}
