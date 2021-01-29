import * as React from 'react';
import styled from 'styled-components';

import Web3Modal from 'web3modal';
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider';
import Column from './components/Column';
import Wrapper from './components/Wrapper';
import Header from './components/Header';
import Loader from './components/Loader';
import ConnectButton from './components/ConnectButton';

import { Web3Provider } from '@ethersproject/providers';
import { getChainData } from './helpers/utilities';
import BookLibrary from './constants/abis/BookLibrary.json';
import LIBWrapper from './constants/abis/LIBWrapper.json';
import LIB from './constants/abis/LIB.json';

import { BOOK_LIBRARY_ADDRESS, WRAPPER_CONTRACT_ADDRESS } from './constants';
import { getContract } from './helpers/ethers'
import Button from './components/Button';
import { utils } from 'ethers';

const SLayout = styled.div`
  position: relative;
  width: 100%;
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const BooksWrapper = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  p {
    margin-right: 5px;
  }
  .elections {
    color: green;
    &.ended {
      color: red;
    }
  }
  div {
    margin-bottom: 10px;
    display: flex;
  }
  margin-bottom: 20px;
  .title {
    font-weight: 700;
  }
`

const TransactionInfoWrapper = styled(Wrapper)`
  width: 100%;
  height: auto;
  color: red;
`

const AddBookForm = styled.div`
  display: flex;
  flex-direction: column;
  div {
    margin-bottom: 10px;
    display: flex;
    justify-content: flex-end;
  }
`

const WrapTokenForm = styled.div`
  display: flex;
  flex-direction: column;
  div {
    margin-bottom: 10px;
    display: flex;
    justify-content: flex-end;
  }
`

const SomethingWentWrong = styled.div`
  color: red;
`

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

const SLanding = styled(Column)`
  height: 600px;
`;

// @ts-ignore
const SBalances = styled(SLanding)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

interface IAppState {
  fetching: boolean;
  address: string;
  provider: any;
  library: any;
  connected: boolean;
  chainId: number;
  pendingRequest: boolean;
  result: any | null;
  bookLibraryContract: any | null;
  wrapperContract: any | null;
  tokenContract: any | null;
  info: any | null;
  bookTitle: string | null;
  bookCopies: string |null;
  error: string | null;
  allBooks: Array<[]> | null;
  transactionHash: string | null;
  token: any;
  balance: any;
}

const INITIAL_STATE: IAppState = {
  fetching: false,
  address: '',
  provider: null,
  library: null,
  connected: false,
  chainId: 1,
  pendingRequest: false,
  result: null,
  bookLibraryContract: null,
  wrapperContract: null,
  tokenContract: null,
  info: null,
  bookTitle: null,
  bookCopies: null,
  error: null,
  allBooks: null,
  transactionHash: null,
  token: null,
  balance: null
};

class App extends React.Component<any, any> {
  // @ts-ignore
  public web3Modal: Web3Modal;
  public state: IAppState;

  constructor(props: any) {
    super(props);
    this.state = {
      ...INITIAL_STATE
    };

    this.web3Modal = new Web3Modal({
      network: this.getNetwork(),
      cacheProvider: true,
      providerOptions: this.getProviderOptions()
    });
  }

  public componentDidMount() {
    if (this.web3Modal.cachedProvider) {
      this.onConnect();
    }
  }

  public onConnect = async () => {
    const provider = await this.web3Modal.connect();

    const library = new Web3Provider(provider);
    const network = await library.getNetwork();

    const address = provider.selectedAddress ? provider.selectedAddress : provider?.accounts[0];

    await this.subscribeToProviderEvents(provider);

    const bookLibraryContract = getContract(BOOK_LIBRARY_ADDRESS, BookLibrary.abi, library, address);
    const wrapperContract = getContract(WRAPPER_CONTRACT_ADDRESS, LIBWrapper.abi, library, address);
    const libAddress = await wrapperContract.LIBToken();
    console.log('LIB ADDRESS',libAddress);
    const wrapperAddress = await bookLibraryContract.wrapperContract();
    console.log('WRAPPER ADDRESS',wrapperAddress);

    const tokenContract = getContract(libAddress, LIB.abi, library, address);


    await this.setState({
      provider,
      library,
      chainId: network.chainId,
      address,
      connected: true,
      bookLibraryContract,
      wrapperContract,
      tokenContract
    });

    await this.getAvailableBooks();
    await this.getLibBalance();
  };

  public async getLibBalance() {
    const { tokenContract, bookLibraryContract } = this.state;
    const balance = await tokenContract.balanceOf(this.state.address);
    const contractBalance = await bookLibraryContract.getAmount();
    console.log('HERE COntract', bookLibraryContract)
    console.log('HERE BOOKLIBRARY ETH BALANCE:s', contractBalance.toString());
    await this.setState({ balance });

    const libraryBalance = await tokenContract.balanceOf(BOOK_LIBRARY_ADDRESS);
    console.log('TOKEN LIBRARY BALANCE in TOKEN Contract:',libraryBalance.toString());

  }

  public async wrapLIBToken() {
    const { tokenContract, wrapperContract, token } = this.state;
    
    const wrapValue = utils.parseEther(token);

    console.log(wrapValue.toString())

    const wrapTx = await wrapperContract.wrap({value: wrapValue})
    await wrapTx.wait();

	  const balance = await tokenContract.balanceOf(this.state.address)
    console.log("Balance after wrapping:", balance.toString())
    await this.getLibBalance();
    
  }

  public async unwrapToken() {
    try {
      const { bookLibraryContract } = this.state;
      await bookLibraryContract.unwrapToken();
    } catch (e) {
      console.log(e)
    }
  }

  public async getAvailableBooks() {
    const { bookLibraryContract } = this.state;
    const numberOfBooks = (await bookLibraryContract.getNumberOfBooks()).toNumber();
    const allBooks = [];
    for (let index = 0; index < numberOfBooks; index++) {
      const bookKey = await bookLibraryContract.bookKey(index);
      const book = await bookLibraryContract.books(bookKey);
      const isBorrowed = await this.isBookBorrowed(this.state.address, bookKey);
          // Keep the key of the book, so we don't have to call every time the contract to get the key.
          const tempBook = {
            copies: book.copies.toString(),
            title: book.title,
            key: bookKey,
            isBorrowed
          }
          allBooks.push(tempBook);
      
    }
    await this.setState({allBooks})
  }

  public async handleChange(event: any) {
    
    switch (event.target.name) {
      case 'book-title':
        await this.setState({bookTitle: event.target.value})
        break;
      case 'book-copies':
        this.setState({bookCopies: event.target.value})
        break;
      case 'lib-token':
        this.setState({token: event.target.value})
        break;
      default:
        break;
    }

  }

  public async addBook() {
    const { bookLibraryContract } = this.state;
		try {
      await this.setState({ fetching: true });
      const transaction = await bookLibraryContract.addBook(this.state.bookTitle, this.state.bookCopies);
  
      await this.setState({ transactionHash: transaction.hash });
      
      const transactionReceipt = await transaction.wait();
      if (transactionReceipt.status !== 1) {
          await this.setState({ transactionHash: null, fetching: false, error: transaction.error });
          return;
      }

      await this.setState({ transactionHash: null, bookTitle: null, bookCopies: null, fetching: false, error: null });
      await this.getAvailableBooks();

    } catch (error) {
      await this.setState({ transactionHash: null, bookTitle: null, bookCopies: null, fetching: false, error: error.message });
    }
	
  }

  public async borrowBook(key: any) {
    const { bookLibraryContract, tokenContract } = this.state;
    const wrapValue = utils.parseEther('1');

    try {
      await this.setState({ fetching: true });

      // Approve Transaction
      const approveTx = await tokenContract.approve(BOOK_LIBRARY_ADDRESS, wrapValue);
      await approveTx.wait()
      
      // Borrow Transaction
      const transaction = await bookLibraryContract.borrowBook(key);
  
      await this.setState({ transactionHash: transaction.hash });
      
      const transactionReceipt = await transaction.wait();
      if (transactionReceipt.status !== 1) {
          await this.setState({ transactionHash: null, fetching: false, error: transaction.error });
          return;
      }

      await this.setState({ transactionHash: null, bookTitle: null, bookCopies: null, fetching: false, error: null });
      await this.getAvailableBooks();
      await this.getLibBalance();

    } catch (error) {
      await this.setState({ transactionHash: null, bookTitle: null, bookCopies: null, fetching: false, error: error.message });
    }

  }

  public async returnBook(key: any) {
    const { bookLibraryContract } = this.state;

    try {
      await this.setState({ fetching: true });
      const transaction = await bookLibraryContract.returnBook(key);
  
      await this.setState({ transactionHash: transaction.hash });
      
      const transactionReceipt = await transaction.wait();
      if (transactionReceipt.status !== 1) {
          await this.setState({ transactionHash: null, fetching: false, error: transaction.error });
          return;
      }

      await this.setState({ transactionHash: null, bookTitle: null, bookCopies: null, fetching: false, error: null });
      await this.getAvailableBooks();

    } catch (error) {
      await this.setState({ transactionHash: null, bookTitle: null, bookCopies: null, fetching: false, error: error.message });
    }

  }

  public async isBookBorrowed(address: any, bookKey: any) {
    const { bookLibraryContract } = this.state;

    return await bookLibraryContract.borrowedBook(address, bookKey);
   
  }

  public subscribeToProviderEvents = async (provider: any) => {
    if (!provider.on) {
      return;
    }
    provider.on("close", () => this.resetApp());
    provider.on("accountsChanged", async (accounts: string[]) => {
      await this.setState({ address: accounts[0] });
    });

    provider.on("networkChanged", async (networkId: number) => {
      const library = new Web3Provider(provider);
      const network = await library.getNetwork();
      const chainId = network.chainId;

      await this.setState({ chainId, library });
    });
  };

  public getNetwork = () => getChainData(this.state.chainId).network;

  public getProviderOptions = () => {
    const providerOptions = {
      walletconnect: {
        package: WalletConnectProvider,
        options: {
          infuraId: process.env.REACT_APP_INFURA_ID
        }
      }
    };
    return providerOptions;
  };

  public resetApp = async () => {
    await this.web3Modal.clearCachedProvider();
    this.setState({ ...INITIAL_STATE });
  };

  public render = () => {
    const {
      address,
      connected,
      chainId,
      fetching
    } = this.state;
    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={this.resetApp}
            balance={this.state.balance}
          />
          <SContent>
            {fetching ? (
              <Column center>
                <SContainer>
                  <Loader />
                  <TransactionInfoWrapper>
                  {this.state.transactionHash && <div>
                      {this.state.transactionHash}
                      <div>
                        <a href={`https://kovan.etherscan.io/tx/${this.state.transactionHash}`} >Link to Etherscan</a>
                      </div>
                    </div>}
                  </TransactionInfoWrapper>
                </SContainer>
              </Column>
            ) : (
                <SLanding center>
                  {!this.state.connected && <ConnectButton onClick={this.onConnect} />}
                  {this.state.connected && <BooksWrapper>
                    
                    {this.state.allBooks?.length && this.state.allBooks?.map((book:any, index) => (
                      <div key={index}>
                        <p>Book Title:</p>
                        <p className="title">
                          {book.title}
                        </p>
                        <p>Available Copies:</p>
                        <p className="copies">
                          {book.copies}
                        </p>
                        { !book.isBorrowed && <Button disabled={book.copies === '0'} onClick={() => this.borrowBook(book.key)} >Borrow</Button>}
                        { book.isBorrowed && <Button color="red" onClick={() => this.returnBook(book.key)}>Return</Button>}
                      </div>
                   
                    ))}
                    {/* <div>
                      The current leader is: {this.state.currentLeader}
                    </div>
                    <div>
                      Biden Seats: {this.state.bidenSeats}
                    </div>
                    <div>
                      Trump Seats: {this.state.trumpSeats}
                    </div> */}
                  </BooksWrapper>}
                  <AddBookForm>
                    <div>
                      <label>
                        Book Title:
                      </label>
                      <input type="text" id='book-title' name="book-title" onChange={() => {this.handleChange(event)}} /> 
                    </div>
                    <div>
                      <label>
                          Book Copies:
                      </label>
                      <input type="number" id='book-copies' name="book-copies" onChange={() => {this.handleChange(event)}}/>
                    </div>     
                    <Button onClick={() => this.addBook()} >Add Book</Button>
                  </AddBookForm>
                  <WrapTokenForm>
                  <div>
                      <label>
                        Wrap ETH TO LIB:
                      </label>
                      <input type="text" id='lib-token' name="lib-token" onChange={() => {this.handleChange(event)}} /> 
                    </div>
                    <Button onClick={() => this.wrapLIBToken()} >Wrap</Button>
                  </WrapTokenForm>
                  {this.state.error && <SomethingWentWrong>
                    {this.state.error}
                  </SomethingWentWrong>}
                  <Button onClick={() => this.unwrapToken()} >Unwrap Token</Button>
                </SLanding>
              )}
          </SContent>
        </Column>
      </SLayout>
    );
  };
}

export default App;
