import { PublicKey } from '@blockworks-foundation/mango-client'
import Button, { LinkButton } from '@components/Button'
import Input from '@components/inputs/Input'
import Loading from '@components/Loading'
import Tooltip from '@components/Tooltip'
import useGovernanceAssets from '@hooks/useGovernanceAssets'
import useQueryContext from '@hooks/useQueryContext'
import useRealm from '@hooks/useRealm'
import { getProgramVersionForRealm } from '@models/registry/api'
import { BN } from '@project-serum/anchor'
import { RpcContext } from '@solana/spl-governance'
import { TransactionInstruction } from '@solana/web3.js'
import {
  fmtMintAmount,
  getMintDecimalAmount,
  getMintMinAmountAsDecimal,
  parseMintNaturalAmountFromDecimal,
} from '@tools/sdk/units'
import { precision } from '@utils/formatting'
import tokenService from '@utils/services/token'
import BigNumber from 'bignumber.js'
import { useRouter } from 'next/router'
import { useState } from 'react'
import useWalletStore from 'stores/useWalletStore'
import useSolendStore from 'Strategies/store/solendStore'
import { HandleCreateProposalWithStrategy } from 'Strategies/types/types'
import useVotePluginsClientStore from 'stores/useVotePluginsClientStore'
import ButtonGroup from '@components/ButtonGroup'
import AdditionalProposalOptions from '@components/AdditionalProposalOptions'
import { validateInstruction } from '@utils/instructionTools'
import * as yup from 'yup'
import { AssetAccount } from '@utils/uiTypes/assets'
import WithdrawModal from './WithdrawModal'
import Select from '@components/inputs/Select'

const DEPOSIT = 'Deposit'
const WITHDRAW = 'Withdraw'

const SolendDepositComponent = ({
  handledMint,
  currentPositionFtm,
  createProposalFcn,
  governedTokenAccount,
}: {
  handledMint: string
  currentPositionFtm: string
  createProposalFcn: HandleCreateProposalWithStrategy
  governedTokenAccount: AssetAccount
}) => {
  const router = useRouter()
  const { fmtUrlWithCluster } = useQueryContext()
  const {
    realmInfo,
    realm,
    ownVoterWeight,
    mint,
    councilMint,
    symbol,
  } = useRealm()
  const [isDepositing, setIsDepositing] = useState(false)
  const [voteByCouncil, setVoteByCouncil] = useState(false)
  const client = useVotePluginsClientStore(
    (s) => s.state.currentRealmVotingClient
  )
  const config = useSolendStore((s) => s)
  const connection = useWalletStore((s) => s.connection)
  const wallet = useWalletStore((s) => s.current)
  const tokenInfo = tokenService.getTokenInfo(handledMint)
  const { canUseTransferInstruction } = useGovernanceAssets()
  const treasuryAmount = governedTokenAccount.extensions?.token
    ? governedTokenAccount.extensions.token.account.amount
    : new BN(0)
  const mintInfo = governedTokenAccount.extensions?.mint?.account
  const tokenSymbol = tokenService.getTokenInfo(
    governedTokenAccount.extensions.mint!.publicKey.toBase58()
  )?.symbol
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    lendingMarketAddress: '',
  })
  const [formErrors, setFormErrors] = useState({})
  const proposalTitle = `Deposit ${form.amount} ${
    tokenSymbol || 'tokens'
  } to Solend`
  const handleSetForm = ({ propertyName, value }) => {
    setFormErrors({})
    setForm({ ...form, [propertyName]: value })
  }
  const [proposalType, setProposalType] = useState('Deposit')
  const mintMinAmount = mintInfo ? getMintMinAmountAsDecimal(mintInfo) : 1
  const maxAmount = mintInfo
    ? getMintDecimalAmount(mintInfo, treasuryAmount)
    : new BigNumber(0)
  const maxAmountFtm = fmtMintAmount(mintInfo, treasuryAmount)
  const currentPrecision = precision(mintMinAmount)

  const tabs = [
    { val: DEPOSIT, isVisible: true },
    { val: WITHDRAW, isVisible: true },
  ]
    .filter((x) => x.isVisible)
    .map((x) => x.val)
  const validateAmountOnBlur = () => {
    handleSetForm({
      propertyName: 'amount',
      value: parseFloat(
        Math.max(
          Number(mintMinAmount),
          Math.min(Number(Number.MAX_SAFE_INTEGER), Number(form.amount))
        ).toFixed(currentPrecision)
      ),
    })
  }

  const handleDeposit = async () => {
    const isValid = await validateInstruction({ schema, form, setFormErrors })
    if (!isValid) {
      return
    }
    try {
      setIsDepositing(true)
      const prerequisiteInstructions: TransactionInstruction[] = []
      const rpcContext = new RpcContext(
        new PublicKey(realm!.owner.toString()),
        getProgramVersionForRealm(realmInfo!),
        wallet!,
        connection.current,
        connection.endpoint
      )
      const mintAmount = parseMintNaturalAmountFromDecimal(
        form.amount!,
        governedTokenAccount.extensions!.mint!.account.decimals
      )
      const ownTokenRecord = ownVoterWeight.getTokenRecordToCreateProposal(
        governedTokenAccount!.governance!.account.config
      )
      const defaultProposalMint = voteByCouncil
        ? realm?.account.config.councilMint
        : !mint?.supply.isZero() ||
          realm?.account.config.useMaxCommunityVoterWeightAddin
        ? realm!.account.communityMint
        : !councilMint?.supply.isZero()
        ? realm!.account.config.councilMint
        : undefined

      const proposalAddress = await createProposalFcn(
        rpcContext,
        {
          ...form,
          proposalCount: Object.keys(proposals).length,
        },
        handledMint,
        realm!,
        governedTokenAccount!,
        ownTokenRecord,
        defaultProposalMint!,
        governedTokenAccount!.governance!.account!.proposalCount,
        prerequisiteInstructions,
        false,
        market,
        client
      )
      const url = fmtUrlWithCluster(
        `/dao/${symbol}/proposal/${proposalAddress}`
      )
      router.push(url)
    } catch (e) {
      console.log(e)
      throw e
    }
    setIsDepositing(false)
  }
  const schema = yup.object().shape({
    amount: yup.number().required('Amount is required').min(mintMinAmount),
    lendingMarketAddress: yup
      .string()
      .required('Lending market address is required'),
  })

  return (
    <div>
      <div className="pb-4">
        <ButtonGroup
          activeValue={proposalType}
          className="h-10"
          onChange={(v) => setProposalType(v)}
          values={tabs}
        />
      </div>
      {/* TODO */}
      {/* {proposalType === WITHDRAW && (
          <WithdrawModal
            market={market}
            governance={governedTokenAccount!.governance!}
            selectedMangoAccount={undefined}
          ></WithdrawModal>
        )} */}
      {proposalType === DEPOSIT && (
        <div>
          <Select
            className="mb-3"
            label="Pool"
            value={''}
            placeholder="Please select..."
            onChange={(val) => setSelectedMangoAccount(val)}
          >
            {mangoAccounts.map((value) => (
              <Select.Option key={value.publicKey.toBase58()} value={value}>
                <MangoAccountItem
                  value={value}
                  market={market}
                  depositIndex={depositIndex}
                ></MangoAccountItem>
              </Select.Option>
            ))}
            <Select.Option key={null} value={null}>
              <div>Create new account</div>
            </Select.Option>
          </Select>
          <div className="flex mb-1.5 text-sm">
            Amount
            <div className="ml-auto flex items-center text-xs">
              <span className="text-fgd-3 mr-1">Bal:</span> {maxAmountFtm}
              <LinkButton
                onClick={() =>
                  handleSetForm({
                    propertyName: 'amount',
                    value: maxAmount.toNumber(),
                  })
                }
                className="font-bold ml-2 text-primary-light"
              >
                Max
              </LinkButton>
            </div>
          </div>
          <Input
            error={formErrors['amount']}
            min={mintMinAmount}
            value={form.amount}
            type="number"
            onChange={(e) =>
              handleSetForm({ propertyName: 'amount', value: e.target.value })
            }
            step={mintMinAmount}
            onBlur={validateAmountOnBlur}
          />
          <AdditionalProposalOptions
            title={form.title}
            description={form.description}
            defaultTitle={proposalTitle}
            defaultDescription={`Deposit ${tokenSymbol} into Solend to mint cTokens. Solend cTokens collect interest as they are being held`}
            setTitle={(evt) =>
              handleSetForm({
                value: evt.target.value,
                propertyName: 'title',
              })
            }
            setDescription={(evt) =>
              handleSetForm({
                value: evt.target.value,
                propertyName: 'description',
              })
            }
            voteByCouncil={voteByCouncil}
            setVoteByCouncil={setVoteByCouncil}
          />
          <div className="border border-fgd-4 p-4 rounded-md mb-6 mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-fgd-3">Current Deposits</span>
              <span className="font-bold text-fgd-1">
                {currentPositionFtm || 0}{' '}
                <span className="font-normal text-fgd-3">
                  {tokenInfo?.symbol}
                </span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-fgd-3">Proposed Deposit</span>
              <span className="font-bold text-fgd-1">
                {form.amount?.toLocaleString() || (
                  <span className="font-normal text-red">Enter an amount</span>
                )}{' '}
                <span className="font-normal text-fgd-3">
                  {form.amount && tokenInfo?.symbol}
                </span>
              </span>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleDeposit}
            disabled={
              !form.amount || !canUseTransferInstruction || isDepositing
            }
          >
            <Tooltip
              content={
                !canUseTransferInstruction
                  ? 'Please connect wallet with enough voting power to create treasury proposals'
                  : !form.amount
                  ? 'Please input the amount'
                  : ''
              }
            >
              {!isDepositing ? 'Propose deposit' : <Loading></Loading>}
            </Tooltip>
          </Button>
        </div>
      )}
    </div>
  )
}

export default SolendDepositComponent
