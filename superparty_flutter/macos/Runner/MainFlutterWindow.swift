import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    
    // Set mobile-like dimensions (iPhone size)
    let mobileWidth: CGFloat = 390
    let mobileHeight: CGFloat = 844
    let newFrame = NSRect(x: windowFrame.origin.x, y: windowFrame.origin.y, width: mobileWidth, height: mobileHeight)
    self.setFrame(newFrame, display: true)
    
    // Center window on screen
    self.center()

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()
  }
}
