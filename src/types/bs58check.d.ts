declare module "bs58check" {
  const bs58check: {
    encode: (data: Uint8Array) => string;
    decode: (str: string) => Uint8Array;
  };
  export default bs58check;
}
