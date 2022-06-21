import { ThemeProvider } from 'next-themes'
import '@dialectlabs/react-ui/index.css'
import '../styles/index.css'
import '../styles/typography.css'
import useWallet from '../hooks/useWallet'
import NavBar from '../components/NavBar'
import PageBodyContainer from '../components/PageBodyContainer'
import useHydrateStore from '../hooks/useHydrateStore'
import useRealm from '../hooks/useRealm'
import handleRouterHistory from '@hooks/handleRouterHistory'
import { useEffect } from 'react'
import useDepositStore from 'VoteStakeRegistry/stores/useDepositStore'
import useWalletStore from 'stores/useWalletStore'
import { useVotingPlugins, vsrPluginsPks } from '@hooks/useVotingPlugins'
import ErrorBoundary from '@components/ErrorBoundary'
import { WalletIdentityProvider } from '@cardinal/namespaces-components'
import useVotePluginsClientStore from 'stores/useVotePluginsClientStore'
import useMarketStore from 'Strategies/store/marketStore'
import handleGovernanceAssetsStore from '@hooks/handleGovernanceAssetsStore'
import tokenService from '@utils/services/token'
import useGovernanceAssets from '@hooks/useGovernanceAssets'
import { usePrevious } from '@hooks/usePrevious'
import useTreasuryAccountStore from 'stores/useTreasuryAccountStore'
import useMembers from '@components/Members/useMembers'
import TransactionLoader from '@components/TransactionLoader'

import dynamic from 'next/dynamic'
import Head from 'next/head'

const Notifications = dynamic(() => import('../components/Notification'), {
  ssr: false,
})
function App({ Component, pageProps }) {
  useHydrateStore()
  useWallet()
  handleRouterHistory()
  useVotingPlugins()
  handleGovernanceAssetsStore()
  useMembers()
  useEffect(() => {
    tokenService.fetchSolanaTokenList()
  }, [])
  const { loadMarket } = useMarketStore()
  const { governedTokenAccounts } = useGovernanceAssets()
  const possibleNftsAccounts = governedTokenAccounts.filter(
    (x) => x.isSol || x.isNft
  )
  const { getNfts } = useTreasuryAccountStore()
  const { getOwnedDeposits, resetDepositState } = useDepositStore()
  const { realm, ownTokenRecord, config } = useRealm()
  const wallet = useWalletStore((s) => s.current)
  const connection = useWalletStore((s) => s.connection)
  const client = useVotePluginsClientStore((s) => s.state.vsrClient)
  const prevStringifyPossibleNftsAccounts = usePrevious(
    JSON.stringify(possibleNftsAccounts)
  )
  const title = 'Solend DAO'

  // Note: ?v==${Date.now()} is added to the url to force favicon refresh.
  // Without it browsers would cache the last used and won't change it for different realms
  // https://stackoverflow.com/questions/2208933/how-do-i-force-a-favicon-refresh

  useEffect(() => {
    if (realm?.pubkey) {
      loadMarket(connection, connection.cluster)
    }
  }, [connection.cluster, realm?.pubkey.toBase58()])
  useEffect(() => {
    if (
      realm &&
      config?.account.communityVoterWeightAddin &&
      vsrPluginsPks.includes(
        config.account.communityVoterWeightAddin.toBase58()
      ) &&
      realm.pubkey &&
      wallet?.connected &&
      ownTokenRecord &&
      client
    ) {
      getOwnedDeposits({
        realmPk: realm!.pubkey,
        communityMintPk: realm!.account.communityMint,
        walletPk: ownTokenRecord!.account!.governingTokenOwner,
        client: client!,
        connection: connection.current,
      })
    } else if (!wallet?.connected || !ownTokenRecord) {
      resetDepositState()
    }
  }, [
    realm?.pubkey.toBase58(),
    ownTokenRecord?.pubkey.toBase58(),
    wallet?.connected,
    client,
  ])

  useEffect(() => {
    if (
      prevStringifyPossibleNftsAccounts !==
        JSON.stringify(possibleNftsAccounts) &&
      realm?.pubkey
    ) {
      getNfts(possibleNftsAccounts, connection.current)
    }
  }, [JSON.stringify(possibleNftsAccounts), realm?.pubkey.toBase58()])

  return (
    <div className="relative">
      <Head>
        <meta property="og:title" content={title} />
        <meta
          name="description"
          content="The governance for the Solend community. Have your voice heard in the biggest algorithmic lending protocol on Solana."
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Solend DAO" />
        <meta
          property="og:image"
          content="https://solend-image-assets.s3.us-east-2.amazonaws.com/og.jpg"
        />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:site" content="@solendprotocol" />
        <meta
          property="og:description"
          content="The governance for the Solend community. Have your voice heard in the biggest algorithmic lending protocol on Solana."
        />
        <title>{title}</title>
        <>
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/favicons/favicon-32x32.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/favicons/favicon-16x16.png"
          />
        </>
      </Head>
      <ErrorBoundary>
        <ThemeProvider defaultTheme="Dark">
          <WalletIdentityProvider appName={'Realms'}>
            <NavBar />
            <Notifications />
            <TransactionLoader></TransactionLoader>
            <PageBodyContainer>
              <Component {...pageProps} />
            </PageBodyContainer>
          </WalletIdentityProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </div>
  )
}

export default App
