import Book from './book';
import EpubCFI from './epubcfi';
import Rendition from './rendition';
import Contents from './contents';
import Layout from './layout';
import ePub from './epub';

// TODO: Remove in 1.0
(window as any).ePub = ePub;

export default ePub;
export { Book, EpubCFI, Rendition, Contents, Layout };
