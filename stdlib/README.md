# Gyro standard-library modules

The compiler currently provides these standard modules as VM-native functions. They do not require Node package installation:

- `std/io`: `print`, `println`, `input`
- `std/math`: `abs`, `floor`, `ceil`, `round`, `sqrt`, `pow`, `min`, `max`, `sin`, `cos`, `tan`, `log`, `exp`, `random`
- `std/string`: `length`, `charAt`, `substring`, `indexOf`, `contains`, `startsWith`, `endsWith`, `replace`, `split`, `toInt`, `toFloat`
- `std/array`: `length`, `push`, `pop`, `join`, `includes`

Both namespace imports and named imports are supported:

```gyro
import * as io from "std/io";
import { sqrt as root } from "std/math";

fun main(): void {
    io.println(root(81));
}
```

At this stage, custom file-based `.gyro` module imports are parsed but not yet linked by the compiler. Unsupported imports fail with an explicit diagnostic rather than being silently ignored.
