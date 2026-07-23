#pragma header

uniform float effect;    
uniform float effect2;   
uniform float power;     
uniform float angle1;
uniform float angle2;

vec2 rotate(vec2 p, float a, vec2 center)
{
    p -= center;
    float cosA = cos(a);
    float sinA = sin(a);
    p = vec2(
        cosA * p.x - sinA * p.y,
        sinA * p.x + cosA * p.y
    );
    return p + center;
}

void main()
{
    vec2 uv = openfl_TextureCoordv.xy;
    vec4 Color = flixel_texture2D(bitmap, uv);

    vec2 p = (uv * openfl_TextureSize.xy) / openfl_TextureSize.x;
    float prop = openfl_TextureSize.x / openfl_TextureSize.y;
    vec2 m = vec2(0.5, 0.5 / prop);
    vec2 d = p - m;
    float r = sqrt(dot(d, d));

    // Prevent division by zero
    float epsilon = 0.0001;
    float adjustedPower = power * -1.3;
    if (abs(adjustedPower) < epsilon) adjustedPower = epsilon;

    float bind;
    if (adjustedPower > 0.0)
        bind = sqrt(dot(m, m));
    else
        bind = (prop < 1.0) ? m.x : m.y;

    vec2 distortedUV;
    if (adjustedPower > 0.0)
        distortedUV = m + normalize(d) * tan(r * adjustedPower) * bind / tan(bind * adjustedPower);
    else if (adjustedPower < 0.0)
        distortedUV = m + normalize(d) * atan(r * -adjustedPower * 10.0) * bind / atan(-adjustedPower * bind * 10.0);
    else 
        distortedUV = uv;

    distortedUV.y *= prop;

    // Apply rotation to UV coordinates before sampling
    vec2 rotatedUV1 = rotate(distortedUV, angle1, vec2(0.5));
    vec2 rotatedUV2 = rotate(distortedUV, angle2, vec2(0.5));

    // Apply the effect to the rotated UVs
    if (rotatedUV1.y < effect || rotatedUV1.y > 1.0 - effect || 
        rotatedUV2.x < effect2 || rotatedUV2.x > 1.0 - effect2)
    {
        Color = vec4(0.0, 0.0, 0.0, 1.0);
    }

    gl_FragColor = Color;
}

