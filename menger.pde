// menger.pde

PShader menger;

void setup()
{
  size(500, 500, P3D);
  smooth(16);
  
  frameRate(50);
  
  menger = loadShader("menger.frag");
}

void draw()
{
  float sec = (float)frameCount / 40.0;
  
  menger.set("resolution", width, height);
  menger.set("time", sec);
  
  filter(menger);
  
//  saveFrame("capture/####.png");

//  textSize(16);
//  text("FPS: " + frameRate, 5, 20);
  
  if(TWO_PI < sec)
  {
//    exit();
  }
  
//  noLoop();
}
