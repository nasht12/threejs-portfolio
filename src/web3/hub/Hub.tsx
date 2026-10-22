const BASE = import.meta.env.BASE_URL;

/** The Web3 section's pieces. Add one here when it ships; each gets its own page under web3/. */
const PIECES = [
  {
    href: 'twelve-seconds/',
    title: 'Twelve Seconds',
    poster: 'web3/media/twelve-seconds.jpg',
    alt: 'A ring of grey pending transactions beside a slab of coloured transaction tiles, the newest Ethereum block.',
    text: 'Ethereum mainnet as it happens. Pending transactions swirl in the public mempool; every twelve seconds a block lands, and you see which of its transactions waited in public and which arrived through private order flow.',
    tags: ['Live mempool', 'Private order flow', 'EIP-1559 fees', 'React Three Fiber'],
  },
  {
    href: 'xray/',
    title: 'Transaction X-ray',
    poster: 'web3/media/xray.jpg',
    alt: 'A transaction taken apart: its calldata mapped word by word to decoded arguments, beside a plain-language summary.',
    text: 'Any transaction, layer by layer: what was signed, its calldata decoded byte by byte, the call tree, its events in plain language, where value moved, and how the fee split between burned and the builder.',
    tags: ['ABI decoding', 'Call traces', 'Value flow', 'Approval risks'],
  },
];

export default function Hub() {
  return (
    <div className="hub">
      <a className="hub-back" href={BASE}>← Three.js Scenes</a>
      <h1>Web3</h1>
      <p className="hub-lede">
        Pieces about how Ethereum actually works, built on live chain data from public nodes. Everything here is read-only:
        no wallet to connect, nothing to sign, nothing sent.
      </p>
      <ul className="hub-cards">
        {PIECES.map(p => (
          <li key={p.href}>
            <a href={`${BASE}web3/${p.href}`}>
              <img src={`${BASE}${p.poster}`} alt={p.alt} width="960" height="600" loading="lazy" />
              <h2>{p.title}</h2>
              <p>{p.text}</p>
              <ul className="hub-tags" aria-label="Topics">{p.tags.map(t => <li key={t}>{t}</li>)}</ul>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
