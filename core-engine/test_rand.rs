fn main() {
    let mut buf = [0u8; 8];
    if getrandom::fill(&mut buf).is_err() {
        println!("getrandom failed");
    } else {
        println!("getrandom success: {:?}", buf);
    }
    let rand_u64 = u64::from_le_bytes(buf);
    let pseudo_random = ((rand_u64 >> 11) as f64) / ((1u64 << 53) as f64);
    println!("pseudo_random: {}", pseudo_random);
}
