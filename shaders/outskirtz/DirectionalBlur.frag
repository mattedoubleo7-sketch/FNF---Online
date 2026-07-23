#pragma header

uniform float ang;
uniform float amount;
uniform sampler2D tex;

const int samples = 50;

vec4 dirBlur(sampler2D tex, vec2 uv, vec2 angle)
{
    vec3 acc = vec3(0);

    const float delta = 2.0 / float(samples);
    for(float i = -1.0; i <= 1.0; i += delta)
    {
        acc += flixel_texture2D(tex, uv - vec2(angle.x * i, angle.y * i)).rgb * delta * .5;
    }
    return vec4(acc, 1.0);
}


void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = openfl_TextureCoordv.xy;
    
    //quick converter so that I can input an angle and it'll always
    float angle = ang;
    float strength = amount;
    
    float r = radians(angle);
    vec2 direction = vec2(sin(r), cos(r));

    fragColor = dirBlur(bitmap, uv, strength*direction);
    //fragColor = texture(bitmap, uv);
}