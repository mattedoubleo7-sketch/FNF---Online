#pragma header
precision mediump float;

uniform float dim;
uniform float Directions;
uniform float Quality;
uniform float Size;

#define Pi 6.28318530718

void main()
{
    vec2 uv = openfl_TextureCoordv.xy;
    vec4 Color = texture2D(bitmap, uv);

    const int MAX_DIRECTIONS = 16;
    const int MAX_QUALITY = 8;

    for (int x = 0; x < MAX_DIRECTIONS; x++)
    {
        if (float(x) >= Directions) break;

        float d = Pi * float(x) / Directions;

        for (int y = 1; y <= MAX_QUALITY; y++)
        {
            if (float(y) > Quality) break;

            float i = float(y) / Quality;

            vec2 offset = vec2(
                cos(d) * Size * i / openfl_TextureSize.x,
                sin(d) * Size * i / openfl_TextureSize.y
            );

            Color += texture2D(bitmap, uv + offset);
        }
    }

    Color /= max((dim * Quality) * Directions - 2.0, 1.0);

    vec4 bloom = (texture2D(bitmap, uv) / dim) + Color;

    gl_FragColor = bloom;
}