#pragma header
        
uniform float brightness;
uniform float contrast;

void main() {
    vec4 color = flixel_texture2D(bitmap, openfl_TextureCoordv);
            
    // Apply brightness
    vec3 rgb = color.rgb + brightness;
            
    // Apply contrast relative to 0.5 midtone
    rgb = (rgb - 0.5) * contrast + 0.5;
            
    // Retain original alpha
    gl_FragColor = vec4(rgb, color.a);
}