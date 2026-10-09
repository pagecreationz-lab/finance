export function loanNumber(value:unknown){
 const number=String(value??'').trim().toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9/_-]{0,39}$/.test(number))throw new Error('Enter a loan number (1–40 letters, digits, hyphens, slashes or underscores).');
 return number;
}
