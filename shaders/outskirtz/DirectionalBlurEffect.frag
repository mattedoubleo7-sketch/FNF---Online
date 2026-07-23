#pragma header
//CODED BY LECHARTERFNF, ALL CREDITS TO ME, DON'T TRY TO PUT IT ON HUD, NOT ALLOWED TO SHARE (i putted lots of efforts bruh)
uniform float angle;
uniform float strength;

const int samples = 25;

vec4 directionalAngleBlur(sampler2D tex, vec2 uv, vec2 angle)
{
    vec3 acc = vec3(0.0);

    const float delta = 2.0 / float(samples);
    for(float i = -1.0; i <= 1.0; i += delta)
    {
        acc += flixel_texture2D(tex, uv - vec2(angle.x * i, angle.y * i)).rgb * delta * .5;
    }
    return vec4(acc, 0.019);
}


void main()
{
    vec2 uv = openfl_TextureCoordv;
    
    float r = radians(angle);
    vec2 direction = vec2(sin(r), cos(r));

    gl_FragColor = directionalAngleBlur(bitmap, uv, strength*direction);
}